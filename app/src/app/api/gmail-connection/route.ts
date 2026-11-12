import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {gmailConfiguration,readGmailConnection} from "../../../server/gmail-vault.ts";
import {beginGmailConnection,disconnectGmail} from "../../../server/gmail-connection.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{requireLocalRequest(request);}catch{return NextResponse.json({error:"Local access required."},{status:403});}
  const config=gmailConfiguration(),saved=readGmailConnection();
  return NextResponse.json({setupReady:config.setupReady,connected:Boolean(saved),account:saved?.email??null,permission:"send-only"},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  try{
    requireLocalRequest(request,true);
    if(request.headers.get("host")!=="127.0.0.1:3000")throw new Error("Use http://127.0.0.1:3000 for Gmail setup.");
    const body=await request.text();if(body.length>1024)throw new Error("Invalid connection request.");const v=JSON.parse(body);
    if(v.action==="disconnect"){const result=await disconnectGmail();return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});}
    if(v.action!=="connect")throw new Error("Invalid connection request.");
    const {url,state}=await beginGmailConnection(),response=NextResponse.json({url},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("nalbace-gmail-state",state,{httpOnly:true,sameSite:"lax",secure:false,path:"/api/gmail-connection/callback",maxAge:600});return response;
  }catch{return NextResponse.json({error:"Gmail setup is incomplete or unavailable. No sending enabled."},{status:400});}
}
