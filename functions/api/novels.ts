function json(data: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(data, { status, headers }); }
interface NovelResult { id:string; title:string; author:string|null; description:string|null; cover_url:string|null; language:string|null; subjects:string[]; source_name:string; source_url:string; formats:Record<string,string>; available_text:boolean; }

async function fetchWithTimeout(url:string,ms=3500){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal})}finally{clearTimeout(timer)}
}

export const onRequestGet:PagesFunction=async({request})=>{
  const url=new URL(request.url);const q=(url.searchParams.get("q")||"").trim();const page=Math.max(Number(url.searchParams.get("page")||1),1);const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),32);
  if(!q)return json({query:"",count:0,results:[]});if(q.length>100)return json({error:"搜索关键词不能超过 100 个字符"},400);
  const cache=caches.default;
  try{const cached=await cache.match(request);if(cached)return cached}catch(e){console.warn("search cache unavailable",e)}
  const api=new URL("https://gutendex.com/books/");api.searchParams.set("search",q);api.searchParams.set("page",String(page));
  try{
    const response=await fetchWithTimeout(api.toString(),3500);
    if(!response.ok)return json({query:q,page,count:0,total:0,next:null,results:[],source_errors:[`Gutendex 返回 ${response.status}`]});
    const data=await response.json() as any;
    const results:NovelResult[]=(Array.isArray(data.results)?data.results:[]).slice(0,limit).map((book:any)=>{const formats=book.formats||{};const textUrl=formats["text/plain; charset=utf-8"]||formats["text/plain"]||formats["text/html"]||null;return{id:`gutendex:${book.id}`,title:book.title||"未知书名",author:Array.isArray(book.authors)&&book.authors[0]?book.authors[0].name:null,description:null,cover_url:formats["image/jpeg"]||null,language:Array.isArray(book.languages)?book.languages[0]||null:null,subjects:Array.isArray(book.subjects)?book.subjects.slice(0,12):[],source_name:"Project Gutenberg / Gutendex",source_url:`https://www.gutenberg.org/ebooks/${book.id}`,formats,available_text:Boolean(textUrl)}});
    const out=json({query:q,page,count:results.length,total:Number(data.count||0),next:data.next||null,results},{status:200,headers:{"Cache-Control":"public, max-age=60, s-maxage=300"}});try{await cache.put(request,out.clone())}catch(e){console.warn("search cache write unavailable",e)}return out;
  }catch(error){
    console.warn("Gutendex search failed",error);
    return json({query:q,page,count:0,total:0,next:null,results:[],source_errors:[error instanceof Error&&error.name==="AbortError"?"Gutendex 请求超时":"Gutendex 暂时不可用"]});
  }
};