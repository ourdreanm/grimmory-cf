import { currentUser, unauthorized } from "../_lib/auth";

interface Env { DB: D1Database; }
function json(data: unknown, status = 200) { return Response.json(data, { status }); }

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const result = await env.DB.prepare(`
    SELECT id,name,type,base_url,enabled,priority,created_at
    FROM sources ORDER BY priority ASC, id ASC
  `).all();
  return json({ sources: result.results || [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user || user.role !== "ADMIN") return unauthorized();
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const name = String(body?.name || "").trim().slice(0, 100);
  const type = String(body?.type || "mixed").trim();
  const baseUrl = body?.base_url ? String(body.base_url).trim().slice(0, 500) : null;
  const priority = Number.isFinite(Number(body?.priority)) ? Number(body.priority) : 200;
  if (!name || !["novel","comic","book","mixed"].includes(type)) {
    return json({ error: "name 必填，type 必须是 novel/comic/book/mixed" }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO sources(name,type,base_url,enabled,priority) VALUES(?,?,?,1,?)
    `).bind(name, type, baseUrl, priority).run();
    return json({ ok: true, id: Number(result.meta.last_row_id) }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "来源创建失败" }, 400);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  if (!user || user.role !== "ADMIN") return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return json({ error: "无效的来源 ID" }, 400);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const fields: string[] = [];
  const binds: any[] = [];
  if (body?.enabled !== undefined) { fields.push("enabled=?"); binds.push(body.enabled ? 1 : 0); }
  if (body?.priority !== undefined) { fields.push("priority=?"); binds.push(Number(body.priority)); }
  if (body?.name !== undefined) { fields.push("name=?"); binds.push(String(body.name).trim().slice(0,100)); }
  if (body?.base_url !== undefined) { fields.push("base_url=?"); binds.push(body.base_url ? String(body.base_url).trim().slice(0,500) : null); }
  if (!fields.length) return json({ error: "没有可更新字段" }, 400);

  await env.DB.prepare(`UPDATE sources SET ${fields.join(",")} WHERE id=?`).bind(...binds, id).run();
  return json({ ok: true });
};
