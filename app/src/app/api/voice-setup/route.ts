import {requireLocalRequest} from "../../../server/local-request.ts";
import {voiceConfiguration} from "../../../server/retell-connection.ts";
import {spendAvailable} from "../../../server/spending.ts";
import {DEMO_OWNER} from "../../../server/fixtures.ts";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{requireLocalRequest(request);}catch{return Response.json({error:"Local access required."},{status:403});}const config=voiceConfiguration();return Response.json({ready:config.ready&&spendAvailable(DEMO_OWNER.merchantId,"voice","retell"),maxSeconds:60,maxAttempts:1,maxMicroUsd:500000},{headers:{"Cache-Control":"no-store"}});}
