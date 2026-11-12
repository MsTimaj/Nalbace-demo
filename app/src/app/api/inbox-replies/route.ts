import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {pullReminderReplies} from "../../../server/gmail-inbox.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{requireLocalRequest(request,true);const text=await request.text();if(text.length>512)throw new Error("Invalid request.");const v=JSON.parse(text);if(typeof v.attemptId!=="string"||!/^[a-f0-9-]{36}$/.test(v.attemptId))throw new Error("Choose a sent reminder.");return NextResponse.json(await pullReminderReplies(v.attemptId),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return NextResponse.json({error:error instanceof Error&&error.message.startsWith("Reply checks are limited")?error.message:"Reply check could not complete. Review the connected mailbox and accepted reminder; nothing was sent."},{status:400});}
}
