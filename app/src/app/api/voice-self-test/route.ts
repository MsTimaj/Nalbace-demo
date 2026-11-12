import {requireLocalRequest} from "../../../server/local-request.ts";
import {saveVoiceSelfTest} from "../../../server/voice-self-test.ts";
export const runtime="nodejs";
export async function POST(request:Request){
 try{requireLocalRequest(request,true);}catch{return Response.json({error:"Local access required."},{status:403});}
 try{const text=await request.text();if(text.length>1000)throw new Error("Enter only the test phone and agreement.");const value=JSON.parse(text);return Response.json(saveVoiceSelfTest(value.phone,value.agreed),{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Enter your own number with country code and agree to the test. If a call was already attempted, review it first."},{status:400});}
}
