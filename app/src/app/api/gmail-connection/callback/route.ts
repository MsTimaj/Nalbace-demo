import {NextRequest,NextResponse} from "next/server";
import {requireLocalRequest} from "../../../../server/local-request.ts";
import {finishGmailConnection} from "../../../../server/gmail-connection.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  try{requireLocalRequest(request);if(request.headers.get("host")!=="127.0.0.1:3000")throw new Error("Unexpected callback host.");}catch{return NextResponse.json({error:"Local callback required."},{status:403});}
  let result="failed";
  try{
    const q=request.nextUrl.searchParams;if(q.has("error"))throw new Error("Permission not granted.");
    await finishGmailConnection(q.get("code")??"",q.get("state")??"",request.cookies.get("nalbace-gmail-state")?.value??"");result="connected";
  }catch{/* Provider errors and authorization codes never enter the response. */}
  const response=NextResponse.redirect(`http://127.0.0.1:3000/operator?gmail=${result}`);
  response.cookies.set("nalbace-gmail-state","",{httpOnly:true,sameSite:"lax",secure:false,path:"/api/gmail-connection/callback",maxAge:0});response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
}
