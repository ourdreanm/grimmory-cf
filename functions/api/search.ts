interface Env {
  DB: D1Database;
}

type SearchType = "book" | "novel" | "comic";
type SearchSourceType = "local" | "external";

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
  type: SearchType;
  source: SearchSourceType;
  source_name: string;
  available: boolean;
  resource_available?: boolean;
  url?: string | null;
  cover_url?: string | null;
  year?: number | null;
  categories?: string[];
}

interface SearchAdapter {
  name: string;
  type: SearchSourceType;
  search(q: string, limit: number): Promise<SearchResult[]>;
}

function classifyType(values: unknown[]): SearchType {
  const text = values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join(" ").toLowerCase();
  if (/comic|comics|graphic novel|manga|manhua|manhwa|漫画|绘本/.test(text)) return "comic";
  if (/fiction|novel|literature|小说|文学|言情|玄幻|科幻|悬疑|推理|武侠/.test(text)) return "novel";
  return "book";
}

function mapLocalBook(book: any): SearchResult {
  return { id:String(book.id), title:book.title, subtitle:book.subtitle, author:book.author, description:book.description, isbn:book.isbn, publisher:book.publisher, publish_date:book.publish_date, language:book.language, page_count:book.page_count, file_type:book.file_type, file_size:book.file_size, file_key:book.file_key, cover_key:book.cover_key, type:classifyType([book.title,book.subtitle,book.description]), source:"local", source_name:"我的书库", available:Boolean(book.file_key), resource_available:Boolean(book.file_key), url:null, cover_url:null, year:book.publish_date?Number(String(book.publish_date).slice(0,4))||null:null };
}

async function searchLocal(db:D1Database,q:string,limit:number):Promise<SearchResult[]> {
  try {
    const result=await db.prepare(`SELECT b.id,b.title,b.subtitle,b.author,b.description,b.isbn,b.publisher,b.publish_date,b.language,b.page_count,b.file_type,b.file_size,b.file_key,b.cover_key FROM books_fts f JOIN books b ON b.id=f.rowid WHERE books_fts MATCH ? ORDER BY b.updated_at DESC LIMIT ?`).bind(q,limit).all();
    if((result.results||[]).length>0)return(result.results||[]).map(mapLocalBook);
  }catch(error){console.warn("FTS search failed, using LIKE fallback:",error)}
  const like=`%${q.replace(/[\\%_]/g,"\\$&")}%`;
  const result=await db.prepare(`SELECT * FROM books WHERE title LIKE ? ESCAPE '\\' OR subtitle LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR isbn LIKE ? ESCAPE '\\' OR publisher LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`).bind(like,like,like,like,like,like,limit).all();
  return(result.results||[]).map(mapLocalBook);
}

async function searchOpenLibrary(q:string,limit:number):Promise<SearchResult[]> {
  const fields=["key","title","subtitle","author_name","first_publish_year","isbn","publisher","language","number_of_pages_median","cover_i","edition_key","ebook_access","subject"].join(",");
  const apiUrl=new URL("https://openlibrary.org/search.json");apiUrl.searchParams.set("q",q);apiUrl.searchParams.set("fields",fields);apiUrl.searchParams.set("limit",String(limit));
  const response=await fetch(apiUrl.toString(),{headers:{Accept:"application/json", "User-Agent":"Grimmory-CF/1.0 (book search)"}});
  if(!response.ok)throw new Error(`Open Library returned ${response.status}`);
  const data=await response.json() as any;const docs=Array.isArray(data.docs)?data.docs:[];
  return docs.map((book:any,index:number):SearchResult=>{const categories=Array.isArray(book.subject)?book.subject.slice(0,12):[];const type=classifyType([book.title,book.subtitle,...categories]);const available=book.ebook_access==="public"||book.ebook_access==="borrowable";return{id:`openlibrary:${book.key||index}`,title:book.title||"未知书名",subtitle:book.subtitle||null,author:Array.isArray(book.author_name)?book.author_name.join(", "):null,description:null,isbn:Array.isArray(book.isbn)?book.isbn[0]||null:null,publisher:Array.isArray(book.publisher)?book.publisher[0]||null:null,publish_date:book.first_publish_year?String(book.first_publish_year):null,language:Array.isArray(book.language)?book.language[0]||null:null,page_count:book.number_of_pages_median||null,file_type:null,file_size:null,file_key:null,cover_key:null,type,source:"external",source_name:"Open Library",available,resource_available:available,url:book.key?`https://openlibrary.org${book.key}`:"https://openlibrary.org",cover_url:book.cover_i?`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`:null,year:book.first_publish_year||null,categories};});
}

async function searchGoogleBooks(q:string,limit:number):Promise<SearchResult[]> {
  const apiUrl=new URL("https://www.googleapis.com/books/v1/volumes");apiUrl.searchParams.set("q",q);apiUrl.searchParams.set("maxResults",String(Math.min(limit,40)));apiUrl.searchParams.set("printType","books");apiUrl.searchParams.set("orderBy","relevance");
  const response=await fetch(apiUrl.toString(),{headers:{Accept:"application/json"}});if(!response.ok)throw new Error(`Google Books returned ${response.status}`);
  const data=await response.json() as any;const items=Array.isArray(data.items)?data.items:[];
  return items.map((item:any):SearchResult=>{const info=item.volumeInfo||{};const access=item.accessInfo||{};const identifiers=Array.isArray(info.industryIdentifiers)?info.industryIdentifiers:[];const isbn=identifiers.find((x:any)=>x.type==="ISBN_13")?.identifier||identifiers.find((x:any)=>x.type==="ISBN_10")?.identifier||null;const categories=Array.isArray(info.categories)?info.categories:[];const type=classifyType([info.title,info.subtitle,...categories,info.mainCategory]);const available=access.viewability==="ALL_PAGES"||access.epub?.isAvailable===true||access.pdf?.isAvailable===true;return{id:`googlebooks:${item.id}`,title:info.title||"未知书名",subtitle:info.subtitle||null,author:Array.isArray(info.authors)?info.authors.join(", "):null,description:info.description||null,isbn,publisher:info.publisher||null,publish_date:info.publishedDate||null,language:info.language||null,page_count:info.pageCount||null,file_type:null,file_size:null,file_key:null,cover_key:null,type,source:"external",source_name:"Google Books",available,resource_available:available,url:info.infoLink||item.selfLink||null,cover_url:info.imageLinks?.thumbnail||info.imageLinks?.smallThumbnail||null,year:info.publishedDate?Number(String(info.publishedDate).slice(0,4))||null:null,categories};});
}

const searchAdapters:SearchAdapter[]=[{name:"我的书库",type:"local",search:searchLocal},{name:"Open Library",type:"external",search:searchOpenLibrary},{name:"Google Books",type:"external",search:searchGoogleBooks}];
function normalizeText(value:string|null|undefined){return String(value||"").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"").trim()}
function dedupeResults(results:SearchResult[]){const seen=new Set<string>(),output:SearchResult[]=[];for(const result of results){const isbn=normalizeText(result.isbn),title=normalizeText(result.title),author=normalizeText(result.author),key=isbn?`isbn:${isbn}`:`title:${title}|author:${author}`;if(!key||key==="title:|author:"){output.push(result);continue}if(seen.has(key))continue;seen.add(key);output.push(result)}return output}

export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  const url=new URL(request.url);const q=(url.searchParams.get("q")||"").trim();const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),50);
  if(!q)return Response.json({query:"",count:0,sources:[],results:[]});
  if(q.length>100)return Response.json({error:"搜索关键词不能超过 100 个字符"},{status:400});

  // 搜索结果与用户无关，允许 Cloudflare 边缘缓存；首次查询后后续相同关键词可直接命中缓存。
  const cache=caches.default;const cached=await cache.match(request);if(cached)return cached;
  const settled=await Promise.allSettled(searchAdapters.map(adapter=>adapter.search(q,limit)));
  const results:SearchResult[]=[];const sources:Array<{name:string;type:SearchSourceType;count:number}>=[];const errors:string[]=[];
  settled.forEach((result,index)=>{const adapter=searchAdapters[index];if(result.status==="fulfilled"){results.push(...result.value);sources.push({name:adapter.name,type:adapter.type,count:result.value.length});return}console.error(`${adapter.name} search error:`,result.reason);errors.push(adapter.name);sources.push({name:adapter.name,type:adapter.type,count:0})});
  const uniqueResults=dedupeResults(results);const body={query:q,count:uniqueResults.length,raw_count:results.length,sources,types:{book:uniqueResults.filter(item=>item.type==="book").length,novel:uniqueResults.filter(item=>item.type==="novel").length,comic:uniqueResults.filter(item=>item.type==="comic").length},results:uniqueResults,...(errors.length>0?{source_errors:errors}:{})};
  const response=Response.json(body,{headers:{"Cache-Control":"public, max-age=60, s-maxage=300"}});await cache.put(request,response.clone());return response;
};