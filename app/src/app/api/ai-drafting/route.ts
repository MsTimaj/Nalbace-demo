import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {aiConfiguration} from "../../../server/model-adapter.ts";
import {readWorkspace} from "../../../server/store.ts";
import {spendAvailable} from "../../../server/spending.ts";
import {DEMO_OWNER} from "../../../server/fixtures.ts";
import {defaultControls} from "../../../domain/workspace-controls.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{requireLocalRequest(request);}catch{return NextResponse.json({error:"Local access required."},{status:403});}
  const config=aiConfiguration(),w=readWorkspace(),runs=w.aiRuns??[],controls=w.controls??defaultControls;
  return NextResponse.json({ready:config.ready&&!controls.aiPaused&&spendAvailable(DEMO_OWNER.merchantId,"ai",process.env.ANTHROPIC_MODEL??""),keyPresent:config.keyPresent,modelSelected:config.modelSelected,used:runs.length,limit:Math.min(config.limit,controls.aiRequestCap),pending:runs.filter(r=>r.state==="pending").map(r=>({id:r.id,caseId:r.caseId,at:r.at})),message:!config.ready?"AI usage is off. Manual review and templates remain available.":controls.aiPaused?"Paused in usage settings. Manual review and templates remain available.":"Available for deliberate test requests within your allowance. Nothing runs automatically."},{headers:{"Cache-Control":"no-store"}});
}
