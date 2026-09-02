type Env = { DB: D1Database };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function pickText(formats: Record<string, string> | undefined) {
  if (!formats) return null;
  return formats["text/plain; charset=utf-8"] || formats["text/plain; charset=us-ascii"] || formats["text/plain"] || null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json({ error: "无效的 Gutendex ID" }, 400);

  const upstream = await fetch(`https://gutendex.com/books/${id}`);
  if (!upstream.ok) return json({ error: "无法获取作品信息" }, 502);
  const book: any = await upstream.json();
  const textUrl = pickText(book.formats);
  if (!textUrl) return json({ error: "该作品没有可用的纯文本版本" }, 404);

  return json({
    id,
    title: book.title,
    authors: book.authors || [],
    source_url: `https://www.gutenberg.org/ebooks/${id}`,
    text_url: textUrl,
    cover_url: book.formats?.["image/jpeg"] || null,
  });
};
