interface Env {
  DB: D1Database;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  description?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  publish_date?: string | null;
  language?: string | null;
  page_count?: number | null;
  file_type?: string | null;
  file_size?: number | null;
  file_key?: string | null;
  cover_key?: string | null;
  type: "book";
  source: "local" | "external";
  source_name: string;
  available: boolean;
  url?: string | null;
  cover_url?: string | null;
  year?: number | null;
}

function mapLocalBook(book: any): SearchResult {
  return {
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
  } as SearchResult;
}

async function searchLocal(
  db: D1Database,
  q: string,
  limit: number
): Promise<SearchResult[]> {
  try {
    const result = await db
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
        JOIN books b ON b.id = f.rowid
        WHERE books_fts MATCH ?
        ORDER BY b.updated_at DESC
        LIMIT ?
      `)
      .bind(q, limit)
      .all();

    if ((result.results || []).length > 0) {
      return (result.results || []).map(mapLocalBook);
    }
  } catch (error) {
    console.warn("FTS search failed, using LIKE fallback:", error);
  }

  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const result = await db
    .prepare(`
      SELECT * FROM books
      WHERE title LIKE ? ESCAPE '\\'
         OR subtitle LIKE ? ESCAPE '\\'
         OR author LIKE ? ESCAPE '\\'
         OR description LIKE ? ESCAPE '\\'
         OR isbn LIKE ? ESCAPE '\\'
         OR publisher LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC
      LIMIT ?
    `)
    .bind(like, like, like, like, like, like, limit)
    .all();

  return (result.results || []).map(mapLocalBook);
}

async function searchOpenLibrary(
  q: string,
  limit: number
): Promise<SearchResult[]> {
  const fields = [
    "key",
    "title",
    "subtitle",
    "author_name",
    "first_publish_year",
    "isbn",
    "publisher",
    "language",
    "number_of_pages_median",
    "cover_i",
    "edition_key",
    "ebook_access"
  ].join(",");

  const apiUrl = new URL("https://openlibrary.org/search.json");
  apiUrl.searchParams.set("q", q);
  apiUrl.searchParams.set("fields", fields);
  apiUrl.searchParams.set("limit", String(limit));

  const response = await fetch(apiUrl.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Grimmory-CF/1.0 (book search)"
    }
  });

  if (!response.ok) {
    throw new Error(`Open Library returned ${response.status}`);
  }

  const data = await response.json() as any;
  const docs = Array.isArray(data.docs) ? data.docs : [];

  return docs.map((book: any, index: number): SearchResult => ({
    id: `openlibrary:${book.key || index}`,
    title: book.title || "未知书名",
    subtitle: book.subtitle || null,
    author: Array.isArray(book.author_name)
      ? book.author_name.join(", ")
      : null,
    description: null,
    isbn: Array.isArray(book.isbn) ? book.isbn[0] || null : null,
    publisher: Array.isArray(book.publisher)
      ? book.publisher[0] || null
      : null,
    publish_date: book.first_publish_year
      ? String(book.first_publish_year)
      : null,
    language: Array.isArray(book.language)
      ? book.language[0] || null
      : null,
    page_count: book.number_of_pages_median || null,
    file_type: null,
    file_size: null,
    file_key: null,
    cover_key: null,
    type: "book",
    source: "external",
    source_name: "Open Library",
    available: book.ebook_access === "public" || book.ebook_access === "borrowable",
    url: book.key ? `https://openlibrary.org${book.key}` : "https://openlibrary.org",
    cover_url: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
      : null,
    year: book.first_publish_year || null
  }));
}

async function searchGoogleBooks(
  q: string,
  limit: number
): Promise<SearchResult[]> {
  const apiUrl = new URL("https://www.googleapis.com/books/v1/volumes");
  apiUrl.searchParams.set("q", q);
  apiUrl.searchParams.set("maxResults", String(Math.min(limit, 40)));
  apiUrl.searchParams.set("printType", "books");
  apiUrl.searchParams.set("orderBy", "relevance");

  const response = await fetch(apiUrl.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Google Books returned ${response.status}`);
  }

  const data = await response.json() as any;
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item: any): SearchResult => {
    const info = item.volumeInfo || {};
    const access = item.accessInfo || {};
    const identifiers = Array.isArray(info.industryIdentifiers)
      ? info.industryIdentifiers
      : [];
    const isbn = identifiers.find((x: any) => x.type === "ISBN_13")?.identifier
      || identifiers.find((x: any) => x.type === "ISBN_10")?.identifier
      || null;

    return {
      id: `googlebooks:${item.id}`,
      title: info.title || "未知书名",
      subtitle: info.subtitle || null,
      author: Array.isArray(info.authors) ? info.authors.join(", ") : null,
      description: info.description || null,
      isbn,
      publisher: info.publisher || null,
      publish_date: info.publishedDate || null,
      language: info.language || null,
      page_count: info.pageCount || null,
      file_type: null,
      file_size: null,
      file_key: null,
      cover_key: null,
      type: "book",
      source: "external",
      source_name: "Google Books",
      available: access.viewability === "ALL_PAGES" || access.epub?.isAvailable === true || access.pdf?.isAvailable === true,
      url: info.infoLink || item.selfLink || null,
      cover_url: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
      year: info.publishedDate
        ? Number(String(info.publishedDate).slice(0, 4)) || null
        : null
    };
  });
}

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env
}) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 20), 1),
    50
  );

  if (!q) {
    return Response.json({
      query: "",
      count: 0,
      sources: [],
      results: []
    });
  }

  if (q.length > 100) {
    return Response.json(
      { error: "搜索关键词不能超过 100 个字符" },
      { status: 400 }
    );
  }

  const [localResult, openLibraryResult, googleBooksResult] = await Promise.allSettled([
    searchLocal(env.DB, q, limit),
    searchOpenLibrary(q, limit),
    searchGoogleBooks(q, limit)
  ]);

  const local = localResult.status === "fulfilled" ? localResult.value : [];
  const openLibrary = openLibraryResult.status === "fulfilled" ? openLibraryResult.value : [];
  const googleBooks = googleBooksResult.status === "fulfilled" ? googleBooksResult.value : [];

  const errors: string[] = [];
  if (localResult.status === "rejected") {
    console.error("Local search error:", localResult.reason);
    errors.push("local");
  }
  if (openLibraryResult.status === "rejected") {
    console.error("Open Library search error:", openLibraryResult.reason);
    errors.push("openlibrary");
  }
  if (googleBooksResult.status === "rejected") {
    console.error("Google Books search error:", googleBooksResult.reason);
    errors.push("googlebooks");
  }

  const results = [...local, ...openLibrary, ...googleBooks];

  return Response.json({
    query: q,
    count: results.length,
    sources: [
      { name: "我的书库", type: "local", count: local.length },
      { name: "Open Library", type: "external", count: openLibrary.length },
      { name: "Google Books", type: "external", count: googleBooks.length }
    ],
    results,
    ...(errors.length > 0 ? { source_errors: errors } : {})
  });
};
