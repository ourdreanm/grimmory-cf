import { currentUser, unauthorized } from "../_lib/auth";

interface Env { DB: D1Database; }
function json(data: unknown, status = 200) { return Response.json(data, { status }); }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const workId = Number(url.searchParams.get("work_id"));
  const chapterId = url.searchParams.get("chapter_id");
  if (!Number.isInteger(workId) || workId < 1) return json({ error: "work_id 无效" }, 400);

  if (chapterId) {
    const id = Number(chapterId);
    if (!Number.isInteger(id) || id < 1) return json({ error: "chapter_id 无效" }, 400);
    const chapter = await env.DB.prepare(`SELECT id,work_id,chapter_index,title,content,source_url,published_at,updated_at FROM chapters WHERE id=? AND work_id=?`).bind(id,workId).first<any>();
    if (!chapter) return json({ error: "章节不存在" }, 404);

    const pages = await env.DB.prepare(`SELECT page_index,image_url,width,height FROM chapter_pages WHERE chapter_id=? ORDER BY page_index ASC`).bind(id).all();
    const user = await currentUser(request, env.DB);
    let progress = null;
    if (user) progress = await env.DB.prepare("SELECT position,updated_at FROM user_chapter_progress WHERE user_id=? AND chapter_id=?").bind(user.id,id).first<any>();
    return json({ chapter, pages: pages.results || [], progress });
  }

  const result = await env.DB.prepare(`SELECT id,chapter_index,title,source_url,published_at,updated_at FROM chapters WHERE work_id=? ORDER BY chapter_index ASC,id ASC`).bind(workId).all();
  return json({ chapters: result.results || [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user) return unauthorized();
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const chapterId = Number(body?.chapter_id);
  if (!Number.isInteger(chapterId) || chapterId < 1) return json({ error: "chapter_id 无效" }, 400);
  const position = Math.min(Math.max(Number(body?.position ?? 0), 0), 1);
  const chapter = await env.DB.prepare("SELECT id,work_id FROM chapters WHERE id=?").bind(chapterId).first<any>();
  if (!chapter) return json({ error: "章节不存在" }, 404);

  const completed = position >= 0.98;
  await env.DB.prepare(`INSERT INTO user_chapter_progress(user_id,chapter_id,position) VALUES(?,?,?) ON CONFLICT(user_id,chapter_id) DO UPDATE SET position=excluded.position,updated_at=CURRENT_TIMESTAMP`).bind(user.id,chapterId,position).run();
  await env.DB.prepare(`INSERT INTO user_library(user_id,work_id,status,last_chapter_id,progress) VALUES(?,?,?, ?,?) ON CONFLICT(user_id,work_id) DO UPDATE SET status=CASE WHEN excluded.status='completed' THEN 'completed' WHEN user_library.status='completed' THEN user_library.status ELSE 'reading' END,last_chapter_id=excluded.last_chapter_id,progress=excluded.progress,updated_at=CURRENT_TIMESTAMP`).bind(user.id,Number(chapter.work_id),completed?'completed':'reading',chapterId,position).run();
  return json({ ok: true, status: completed ? "completed" : "reading", progress: position });
};
