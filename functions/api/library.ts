import { currentUser, unauthorized } from "../_lib/auth";

interface Env { DB: D1Database; }
function json(data: unknown, status = 200) { return Response.json(data, { status }); }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const favorite = url.searchParams.get("favorite");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  const conditions = ["ul.user_id=?"];
  const binds: any[] = [user.id];
  if (["novel","comic","book"].includes(type || "")) { conditions.push("w.type=?"); binds.push(type); }
  if (["want","reading","completed"].includes(status || "")) { conditions.push("ul.status=?"); binds.push(status); }
  if (favorite === "1") { conditions.push("ul.favorite=1"); }

  const result = await env.DB.prepare(`
    SELECT w.id,w.type,w.title,w.subtitle,w.author,w.description,w.cover_url,w.language,w.status AS work_status,
           ul.status AS library_status,ul.favorite,ul.last_chapter_id,ul.progress,ul.added_at,ul.updated_at,
           c.title AS last_chapter_title,
           (SELECT COUNT(*) FROM chapters c2 WHERE c2.work_id=w.id) AS chapter_count
    FROM user_library ul JOIN works w ON w.id=ul.work_id
    LEFT JOIN chapters c ON c.id=ul.last_chapter_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY ul.updated_at DESC LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();

  return json({
    items: (result.results || []).map((item: any) => ({ ...item, favorite: Boolean(item.favorite), chapter_count: Number(item.chapter_count || 0) })),
    limit, offset
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return unauthorized();
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const workId = Number(body?.work_id);
  if (!Number.isInteger(workId) || workId < 1) return json({ error: "work_id 无效" }, 400);

  const exists = await env.DB.prepare("SELECT id FROM works WHERE id=?").bind(workId).first<any>();
  if (!exists) return json({ error: "作品不存在" }, 404);

  const libraryStatus = ["want","reading","completed"].includes(body?.status) ? body.status : "want";
  const favorite = body?.favorite === true || body?.favorite === 1 ? 1 : 0;
  const chapterId = body?.last_chapter_id == null ? null : Number(body.last_chapter_id);
  const progress = Math.min(Math.max(Number(body?.progress ?? 0), 0), 1);

  if (chapterId !== null) {
    const chapter = await env.DB.prepare("SELECT id FROM chapters WHERE id=? AND work_id=?").bind(chapterId, workId).first<any>();
    if (!chapter) return json({ error: "章节不属于该作品" }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO user_library(user_id,work_id,status,favorite,last_chapter_id,progress)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id,work_id) DO UPDATE SET
      status=excluded.status,favorite=excluded.favorite,last_chapter_id=excluded.last_chapter_id,
      progress=excluded.progress,updated_at=CURRENT_TIMESTAMP
  `).bind(user.id, workId, libraryStatus, favorite, chapterId, progress).run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("work_id"));
  if (!Number.isInteger(id) || id < 1) return json({ error: "work_id 无效" }, 400);
  await env.DB.prepare("DELETE FROM user_library WHERE user_id=? AND work_id=?").bind(user.id, id).run();
  return json({ ok: true });
};
