interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env
}) => {
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();

  const parsedLimit = Number(url.searchParams.get("limit") || 30);
  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 30, 1),
    100
  );

  if (!q) {
    return Response.json({
      query: "",
      count: 0,
      results: []
    });
  }

  if (q.length > 100) {
    return Response.json(
      {
        error: "搜索关键词不能超过 100 个字符"
      },
      {
        status: 400
      }
    );
  }

  try {
    // 先使用 FTS5，适合英文等有明确分词边界的内容。
    let result = await env.DB
      .prepare(`
        SELECT
          b.id,
          b.title,
          b.subtitle,
          b.author,
          b.description,
          b.isbn,
          b.publisher,
          b.publish_date,
          b.language,
          b.page_count,
          b.file_type,
          b.file_size,
          b.file_key,
          b.cover_key,
          b.created_at,
          b.updated_at
        FROM books_fts f
        JOIN books b
          ON b.id = f.rowid
        WHERE books_fts MATCH ?
        ORDER BY b.updated_at DESC
        LIMIT ?
      `)
      .bind(q, limit)
      .all();

    // 中文默认 FTS5 分词可能无法按预期匹配，因此无结果时使用 LIKE 兜底。
    if (!result.results?.length) {
      const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

      result = await env.DB
        .prepare(`
          SELECT
            b.id,
            b.title,
            b.subtitle,
            b.author,
            b.description,
            b.isbn,
            b.publisher,
            b.publish_date,
            b.language,
            b.page_count,
            b.file_type,
            b.file_size,
            b.file_key,
            b.cover_key,
            b.created_at,
            b.updated_at
          FROM books b
          WHERE
            b.title LIKE ? ESCAPE '\\'
            OR b.subtitle LIKE ? ESCAPE '\\'
            OR b.author LIKE ? ESCAPE '\\'
            OR b.description LIKE ? ESCAPE '\\'
            OR b.isbn LIKE ? ESCAPE '\\'
            OR b.publisher LIKE ? ESCAPE '\\'
          ORDER BY b.updated_at DESC
          LIMIT ?
        `)
        .bind(like, like, like, like, like, like, limit)
        .all();
    }

    const results = (result.results || []).map(
      (book: any) => ({
        id: String(book.id),
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        description: book.description,
        isbn: book.isbn,
        publisher: book.publisher,
        publish_date: book.publish_date,
        language: book.language,
        page_count: book.page_count,
        file_type: book.file_type,
        file_size: book.file_size,
        file_key: book.file_key,
        cover_key: book.cover_key,
        type: "book",
        source: "local",
        source_name: "我的书库",
        available: Boolean(book.file_key),
        created_at: book.created_at,
        updated_at: book.updated_at
      })
    );

    return Response.json({
      query: q,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Search API error:", error);

    return Response.json(
      {
        error: "搜索失败",
        message:
          error instanceof Error
            ? error.message
            : String(error)
      },
      {
        status: 500
      }
    );
  }
};
