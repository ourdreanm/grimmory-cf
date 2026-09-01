import {currentUser} from "../../_lib/auth";
export const onRequestGet:PagesFunction=async({request,env})=>{const u=await currentUser(request,env.DB);return Response.json({user:u?{id:u.id,username:u.username,role:u.role}:null})};
