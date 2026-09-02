import { currentUser, unauthorized } from "../_lib/auth";

type Env = {
  DB: D1Database;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env);
  if (!user) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "无效的 Gutendex ID" }, 400);

  const upstream = await fetch(`https://gutendex.com/books/${id}`);
  if (!upstream.ok) return json({ error: "无法获取作品信息" }, 502);
  const book: any = await upstream.json();

  const title = clean(book.title, 500) || "未命名作品";
  const author = clean((book.authors || []).map((a: any) => a.name).join(", "), 500);
  const description = clean((book.subjects || []).join("；"), 2000);
  const coverUrl = clean(book.formats?.["image/jpeg"] || book.formats?.["image/webp"], 2000);
  const language = clean(book.languages?.[0], 20);
  const year = book?.copyright ? null : null;
  const externalId = `gutendex:${id}`;
  const sourceUrl = `https://www.gutenberg.org/ebooks/${id}`;

  const source = await env.DB.prepare("SELECT id FROM sources WHERE type IN ('book','mixed','novel') AND enabled=1 ORDER BY priority DESC, id LIMIT 1").first<{ id: number }>();
  if (!source) return json({ error: "没有启用的数据源" }, 409);

  const existing = await env.DB.prepare(
    "SELECT w.id FROM works w JOIN work_sources ws ON ws.work_id=w.id WHERE ws.source_id=? AND ws.external_id=? LIMIT 1"
  ).bind(source.id, externalId).first<{ id: number }>();

  let workId = existing?.id;
  if (!workId) {
    const result = await env.DB.prepare(
      `INSERT INTO works (type,title,author,description,cover_url,language,status,year,categories_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
    ).bind(
      "novel", title, author || null, description || null, coverUrl || null, language || null,
      "available", year, JSON.stringify(book.subjects || [])
    ).run();
    workId = Number(result.meta.last_row_id);

    await env.DB.prepare(
      `INSERT INTO work_sources (work_id,source_id,external_id,source_url,metadata_json,content_available,reader_available,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
    ).bind(
      workId, source.id, externalId, sourceUrl, JSON.stringify(book), 1, 1
    ).run();
  }

  await env.DB.prepare(
    `INSERT INTO user_library (user_id,work_id,status,favorite,progress,added_at,updated_at)
     VALUES (?,?, 'want',0,0,datetime('now'),datetime('now'))
     ON CONFLICT(user_id,work_id) DO UPDATE SET updated_at=datetime('now')`
  ).bind(user.id, workId).run();

  return json({ ok: true, work_id: workId, title, source_url: sourceUrl });
};
