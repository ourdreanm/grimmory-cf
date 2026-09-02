import { currentUser, unauthorized } from "../_lib/auth";

interface Env { DB: D1Database; }

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function parseCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 30);
  return [];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return json({ error: "无效的作品 ID" }, 400);

  const work = await env.DB.prepare(`
    SELECT w.*, COUNT(DISTINCT c.id) AS chapter_count,
      COALESCE((SELECT COUNT(*) FROM user_library ul WHERE ul.work_id=w.id AND ul.favorite=1),0) AS favorite_count
    FROM works w
    LEFT JOIN chapters c ON c.work_id=w.id
    WHERE w.id=? GROUP BY w.id
  `).bind(id).first<any>();
  if (!work) return json({ error: "作品不存在" }, 404);

  const sources = await env.DB.prepare(`
    SELECT ws.id, ws.external_id, ws.source_url, ws.content_available, ws.reader_available,
           s.id AS source_id, s.name AS source_name, s.type AS source_type
    FROM work_sources ws JOIN sources s ON s.id=ws.source_id
    WHERE ws.work_id=? ORDER BY s.priority ASC, ws.id ASC
  `).bind(id).all();

  const user = await currentUser(request, env.DB);
  let library = null;
  if (user) {
    library = await env.DB.prepare(`
      SELECT status,favorite,last_chapter_id,progress,added_at,updated_at
      FROM user_library WHERE user_id=? AND work_id=?
    `).bind(user.id, id).first<any>();
  }

  return json({
    work: {
      ...work,
      categories: work.categories_json ? JSON.parse(work.categories_json) : [],
      categories_json: undefined,
      chapter_count: Number(work.chapter_count || 0),
      favorite_count: Number(work.favorite_count || 0)
    },
    sources: sources.results || [],
    library
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const title = String(body?.title || "").trim();
  const type = String(body?.type || "").trim();
  if (!title || !["novel", "comic", "book"].includes(type)) {
    return json({ error: "title 和 type 必填，type 必须是 novel/comic/book" }, 400);
  }

  const sourceName = String(body?.source_name || "我的收藏").trim().slice(0, 100);
  const externalId = String(body?.external_id || body?.id || title).trim().slice(0, 500);
  const sourceUrl = body?.url ? String(body.url).slice(0, 2000) : null;
  const categories = parseCategories(body?.categories);

  const existingSource = await env.DB.prepare("SELECT id FROM sources WHERE name=?").bind(sourceName).first<any>();
  let sourceId = existingSource?.id as number | undefined;
  if (!sourceId) {
    const inserted = await env.DB.prepare(
      "INSERT INTO sources(name,type,base_url,priority) VALUES(?,?,?,200)"
    ).bind(sourceName, type, sourceUrl ? new URL(sourceUrl).origin : null).run();
    sourceId = Number(inserted.meta.last_row_id);
  }

  const existingLink = await env.DB.prepare(
    "SELECT work_id FROM work_sources WHERE source_id=? AND external_id=?"
  ).bind(sourceId, externalId).first<any>();

  let workId: number;
  if (existingLink?.work_id) {
    workId = Number(existingLink.work_id);
    await env.DB.prepare(`UPDATE works SET subtitle=?,author=?,description=?,cover_url=?,language=?,status=?,year=?,categories_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(body.subtitle || null, body.author || null, body.description || null, body.cover_url || null, body.language || null, body.status || null, body.year ? Number(body.year) : null, JSON.stringify(categories), workId).run();
  } else {
    const inserted = await env.DB.prepare(`
      INSERT INTO works(type,title,subtitle,author,description,cover_url,language,status,year,categories_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(type,title,body.subtitle||null,body.author||null,body.description||null,body.cover_url||null,body.language||null,body.status||null,body.year?Number(body.year):null,JSON.stringify(categories)).run();
    workId = Number(inserted.meta.last_row_id);
    await env.DB.prepare(`INSERT INTO work_sources(work_id,source_id,external_id,source_url,metadata_json,content_available,reader_available) VALUES(?,?,?,?,?,0,0)`)
      .bind(workId,sourceId,externalId,sourceUrl,JSON.stringify(body.metadata || {})).run();
  }

  await env.DB.prepare(`INSERT INTO user_library(user_id,work_id,status) VALUES(?,?, 'want') ON CONFLICT(user_id,work_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`)
    .bind(user.id, workId).run();

  return json({ ok: true, work_id: workId, added: true });
};
