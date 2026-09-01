import {currentUser} from "../../_lib/auth";

export const onRequestGet:PagesFunction=async({request,params,env})=>{
 const id=Number(params.id);if(!Number.isInteger(id))return Response.json({error:"invalid id"},{status:400});
 const b=await env.DB.prepare("SELECT id,title,author,file_type,file_key,cover_key FROM books WHERE id=?").bind(id).first<any>();
 if(!b)return Response.json({error:"not found"},{status:404});
 const u=await currentUser(request,env.DB);
 if(u)await env.DB.prepare("INSERT INTO reading_history(user_id,book_id) VALUES(?,?)").bind(u.id,id).run();
 return Response.json({...b,stream_url:b.file_key?`/api/file/${encodeURIComponent(b.file_key)}`:null});
};
