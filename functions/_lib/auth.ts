const enc=new TextEncoder();
const PBKDF2_ITERATIONS=100000;
function b64(a:Uint8Array){let s="";for(const x of a)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,'')}
function unb64(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0))}
export async function hashPassword(p:string){const salt=crypto.getRandomValues(new Uint8Array(16));const k=await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]);const b=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:PBKDF2_ITERATIONS,hash:"SHA-256"},k,256));return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(b)}`}
export async function verifyPassword(p:string,s:string){const z=s.split("$");if(z.length!==4)return false;const iterations=Number(z[1]);if(!Number.isInteger(iterations)||iterations<1||iterations>PBKDF2_ITERATIONS)return false;const k=await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]);const b=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(z[2]),iterations,hash:"SHA-256"},k,256)),e=unb64(z[3]);if(b.length!==e.length)return false;let d=0;for(let i=0;i<b.length;i++)d|=b[i]^e[i];return d===0}
export async function createSession(db:D1Database,userId:number){const id=crypto.randomUUID(),expires=Date.now()+2592000000;await db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)").bind(id,userId,expires).run();return{id,expires}}
export async function currentUser(req:Request,db:D1Database){const c=req.headers.get("Cookie")||"",m=c.match(/(?:^|;\s*)grimmory_session=([^;]+)/);if(!m)return null;return await db.prepare("SELECT u.id,u.username,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?").bind(m[1],Date.now()).first<any>()}
export const cookie=(id:string)=>`grimmory_session=${id}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
export const clearCookie=()=>`grimmory_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export const unauthorized=()=>Response.json({error:"未登录"},{status:401});
export const forbidden=()=>Response.json({error:"需要管理员权限"},{status:403});
