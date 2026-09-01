import {clearCookie} from "../../_lib/auth";
export const onRequestPost:PagesFunction=async({request,env})=>{const c=request.headers.get("Cookie")||"",m=c.match(/(?:^|;\s*)grimmory_session=([^;]+)/);if(m)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(m[1]).run();return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json","Set-Cookie":clearCookie()}})};
