export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "").replace(/^\/+/, "");

  if (!key || key.includes("..")) {
    return new Response("Bad key", { status: 400 });
  }

  const object = await env.BOOKS.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(object.body, { headers });
};
