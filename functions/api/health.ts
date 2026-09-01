export const onRequestGet: PagesFunction = async ({ env }) => {
  try { await env.DB.prepare("SELECT 1").first(); return Response.json({ok:true,app:env.APP_NAME||"Grimmory CF",db:"ok"}); }
  catch { return Response.json({ok:false,db:"error"},{status:500}); }
};
