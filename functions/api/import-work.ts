interface Env { DB: D1Database; }

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function clean(value: unknown, max = 2000) {
  return value == null ? null : String(value).trim().slice(0, max) || null;
}

function yearOf(value: unknown) {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function categoriesOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map(String).slice(0, 30);
}

async function fetchJson(url: string, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Grimmory-CF/1.0" }, signal: controller.signal });
    if (!response.ok) throw new Error(`上游返回 HTTP ${response.status}`);
    return await response.json() as any;
  } finally {
    clearTimeout(timer);
  }
}

async function getMetadata(sourceName: string, externalId: string) {
  if (sourceName === "Open Library") {
    const key = externalId.replace(/^openlibrary:/, "");
    if (!/^\/works\/[A-Za-z0-9_-]+$/.test(key)) throw new Error("Open Library 作品 ID 无效");
    const data = await fetchJson(`https://openlibrary.org${key}.json`);
    const authors = Array.isArray(data.authors) ? data.authors : [];
    const authorNames: string[] = [];
    for (const item of authors.slice(0, 5)) {
      const authorKey = item?.author?.key;
      if (!authorKey) continue;
      try {
        const author = await fetchJson(`https://openlibrary.org${authorKey}.json`, 3000);
        if (author?.name) authorNames.push(String(author.name));
      } catch {}
    }
    const coverId = Array.isArray(data.covers) ? data.covers[0] : null;
    return {
      title: clean(data.title, 500) || "未知书名",
      subtitle: clean(data.subtitle, 500),
      author: authorNames.join(", ") || null,
      description: typeof data.description === "string" ? data.description : clean(data.description?.value, 6000),
      cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      language: Array.isArray(data.languages) && data.languages[0]?.key ? String(data.languages[0].key).split("/").pop() : null,
      status: null,
      year: yearOf(data.first_publish_date),
      categories: categoriesOf(data.subjects),
      source_url: `https://openlibrary.org${key}`,
      metadata: data
    };
  }

  if (sourceName === "Google Books") {
    const volumeId = externalId.replace(/^googlebooks:/, "").trim();
    if (!/^[A-Za-z0-9._-]+$/.test(volumeId)) throw new Error("Google Books 作品 ID 无效");
    const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}`);
    const info = data.volumeInfo || {};
    return {
      title: clean(info.title, 500) || "未知书名",
      subtitle: clean(info.subtitle, 500),
      author: Array.isArray(info.authors) ? info.authors.join(", ") : null,
      description: clean(info.description, 6000),
      cover_url: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
      language: clean(info.language, 50),
      status: null,
      year: yearOf(info.publishedDate),
      categories: categoriesOf(info.categories),
      source_url: info.infoLink || data.selfLink || null,
      metadata: data
    };
  }

  throw new Error("暂不支持该外部资源源");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "JSON 参数无效" }, 400); }

  const sourceName = clean(body?.source_name, 100);
  const externalId = clean(body?.external_id, 500);
  if (!sourceName || !externalId) return json({ error: "source_name 和 external_id 必填" }, 400);

  try {
    const existing = await env.DB.prepare(`
      SELECT ws.work_id FROM work_sources ws
      JOIN sources s ON s.id=ws.source_id
      WHERE s.name=? AND ws.external_id=? LIMIT 1
    `).bind(sourceName, externalId).first<any>();

    if (existing?.work_id) {
      return json({ ok: true, work_id: Number(existing.work_id), imported: false });
    }

    const meta = await getMetadata(sourceName, externalId);
    const type = body?.type === "comic" ? "comic" : body?.type === "novel" ? "novel" : "book";

    const sourceExisting = await env.DB.prepare("SELECT id FROM sources WHERE name=?").bind(sourceName).first<any>();
    let sourceId = sourceExisting?.id as number | undefined;
    if (!sourceId) {
      const inserted = await env.DB.prepare(
        "INSERT INTO sources(name,type,base_url,priority) VALUES(?,?,?,200)"
      ).bind(sourceName, "external", meta.source_url ? new URL(meta.source_url).origin : null).run();
      sourceId = Number(inserted.meta.last_row_id);
    }

    const inserted = await env.DB.prepare(`
      INSERT INTO works(type,title,subtitle,author,description,cover_url,language,status,year,categories_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(
      type, meta.title, meta.subtitle, meta.author, meta.description, meta.cover_url,
      meta.language, meta.status, meta.year, JSON.stringify(meta.categories)
    ).run();
    const workId = Number(inserted.meta.last_row_id);

    await env.DB.prepare(`
      INSERT INTO work_sources(work_id,source_id,external_id,source_url,metadata_json,content_available,reader_available)
      VALUES(?,?,?,?,?,0,0)
    `).bind(workId, sourceId, externalId, meta.source_url, JSON.stringify(meta.metadata || {})).run();

    return json({ ok: true, work_id: workId, imported: true, title: meta.title });
  } catch (error: any) {
    console.error("external work import failed:", error);
    return json({ error: error?.name === "AbortError" ? "外部资源请求超时，请稍后重试" : (error?.message || "外部资源导入失败") }, 502);
  }
};
