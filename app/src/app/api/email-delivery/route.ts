import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {emailConfiguration} from "../../../server/email-delivery.ts";
import {spendAvailable} from "../../../server/spending.ts";
import {DEMO_OWNER} from "../../../server/fixtures.ts";
import {readWorkspace} from "../../../server/store.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{requireLocalRequest(request);}catch{return NextResponse.json({error:"Local access required."},{status:403});}
  const config=emailConfiguration(),attempts=readWorkspace().emailAttempts??[];
  return NextResponse.json({ready:config.ready&&spendAvailable(DEMO_OWNER.merchantId,"email",config.provider),provider:config.provider,used:attempts.length,limit:config.limit,pending:attempts.filter(a=>a.state==="reserved"||a.state==="unknown").length},{headers:{"Cache-Control":"no-store"}});
}
