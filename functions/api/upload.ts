import {currentUser,unauthorized,forbidden} from "../_lib/auth";

export const onRequestPost:PagesFunction=async({request,env})=>{
  const u=await currentUser(request,env.DB);if(!u)return unauthorized();if(u.role!=="ADMIN")return forbidden();
  const form=await request.formData();const f=form.get("file");
  if(!(f instanceof File))return Response.json({error:"缺少file"},{status:400});
  if(f.size>90*1024*1024)return Response.json({error:"文件超过90MB，请使用大文件直传功能"},{status:413});
  const ext=(f.name.split(".").pop()||"bin").toLowerCase();
  const ok=["epub","pdf","mobi","azw","azw3","fb2","cbz","cbr","cb7","m4b","m4a","mp3","opus"];
  if(!ok.includes(ext))return Response.json({error:"暂不支持该格式"},{status:415});
  const key=`books/${crypto.randomUUID()}.${ext}`;
  await env.BOOKS.put(key,f.stream(),{httpMetadata:{contentType:f.type||"application/octet-stream"}});
  return Response.json({ok:true,key,size:f.size,type:ext,name:f.name},{status:201});
};
