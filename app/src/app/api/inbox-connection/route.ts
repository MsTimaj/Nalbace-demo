import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {inboxConfiguration,readInboxConnection} from "../../../server/gmail-inbox-vault.ts";
import {beginInboxConnection,disconnectInbox} from "../../../server/gmail-inbox-connection.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{requireLocalRequest(request);}catch{return NextResponse.json({error:"Local access required."},{status:403});}
  const config=inboxConfiguration(),saved=readInboxConnection();
  return NextResponse.json({setupReady:config.setupReady,connected:Boolean(saved),account:saved?.email??null,permission:"read-only"},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  try{
    requireLocalRequest(request,true);
    if(request.headers.get("host")!=="127.0.0.1:3000")throw new Error("Use http://127.0.0.1:3000 for Inbox setup.");
    const body=await request.text();if(body.length>1024)throw new Error("Invalid connection request.");const v=JSON.parse(body);
    if(v.action==="disconnect"){const result=await disconnectInbox();return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});}
    if(v.action!=="connect")throw new Error("Invalid connection request.");
    const {url,state}=await beginInboxConnection(),response=NextResponse.json({url},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("nalbace-inbox-state",state,{httpOnly:true,sameSite:"lax",secure:false,path:"/api/inbox-connection/callback",maxAge:600});return response;
  }catch{return NextResponse.json({error:"Inbox setup is incomplete or unavailable. No inbox access enabled."},{status:400});}
}
