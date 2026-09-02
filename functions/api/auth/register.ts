import { hashPassword, createSession, cookie } from "../../_lib/auth";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const body = await request.json().catch(() => null) as any;
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
    return Response.json(
      { error: "用户名需要3-32位字母数字下划线或短横线" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json({ error: "密码至少8位" }, { status: 400 });
  }

  try {
    const existing = await env.DB
      .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
      .bind(username)
      .first<any>();

    if (existing) {
      return Response.json({ error: "用户名已存在，请直接登录" }, { status: 409 });
    }

    const count = await env.DB
      .prepare("SELECT COUNT(*) AS c FROM users")
      .first<any>();

    const role = Number(count?.c || 0) === 0 ? "ADMIN" : "USER";
    const passwordHash = await hashPassword(password);

    await env.DB
      .prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)")
      .bind(username, passwordHash, role)
      .run();

    // 不依赖 last_row_id，直接按唯一用户名读取新用户 ID。
    const user = await env.DB
      .prepare("SELECT id, username, role FROM users WHERE username = ? LIMIT 1")
      .bind(username)
      .first<any>();

    if (!user?.id) {
      throw new Error("用户已写入，但无法读取新用户ID");
    }

    const session = await createSession(env.DB, Number(user.id));

    return new Response(
      JSON.stringify({
        ok: true,
        firstAdmin: role === "ADMIN",
        user: { username: user.username, role: user.role }
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookie(session.id)
        }
      }
    );
  } catch (error) {
    console.error("register failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `注册失败：${message}` },
      { status: 500 }
    );
  }
};
