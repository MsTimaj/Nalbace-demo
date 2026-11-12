import "server-only";
import {reserveSpend,recordSpendOutcome} from "./spending.ts";
import {aiConfiguration,claudeDraftModel,claudeReplyModel,ModelError} from "./model-adapter.ts";
import {reserveAiDraft,completeAiDraft,failAiDraft,readWorkspace,refreshSandboxCase,reserveAiReply,completeAiReply} from "./store.ts";
import type {DraftModel} from "../domain/draft-proposal.ts";
import {defaultControls} from "../domain/workspace-controls.ts";
import type {ReplyModel} from "../domain/reply-review.ts";
export async function prepareAiDraft(caseId:string,adapter?:DraftModel){
  const config=aiConfiguration();
  if(!config.ready)throw new Error("AI usage is disabled for this demo. Templates and manual review remain available.");
  const controls=readWorkspace().controls??defaultControls;
  if(controls.aiPaused)throw new Error("AI suggestions are paused in Settings.");
  const model=adapter??claudeDraftModel(process.env.ANTHROPIC_API_KEY!,process.env.ANTHROPIC_MODEL!);
  const current=readWorkspace().cases.find(c=>c.id===caseId);
  if(current?.source==="paypal-sandbox")await refreshSandboxCase(caseId);
  const reserved=reserveAiDraft(caseId,config.limit);
  let spendingId:string|undefined;
  try{
    spendingId=reserveSpend(`ai:${reserved.runId}`,current!.merchantId,"ai",model.model).id;
    const value=await model.propose(reserved.context);recordSpendOutcome(spendingId,"committed");
    return completeAiDraft(reserved.runId,value,model.provider,model.model);
  }
  catch(error){if(spendingId)recordSpendOutcome(spendingId,"unknown");failAiDraft(reserved.runId);throw new Error(error instanceof ModelError?`Review AI request: ${error.message}`:"Review AI proposal: it was rejected or the case changed. Nothing was approved; no automatic retry.");}
}
export async function interpretSavedReply(caseId:string,replyId:string,adapter?:ReplyModel){
  const config=aiConfiguration();
  if(!config.ready)throw new Error("AI usage is disabled for this demo. Templates and manual review remain available.");
  const reserved=reserveAiReply(caseId,replyId,config.limit);
  let spendingId:string|undefined;
  try{
    const model=adapter??claudeReplyModel(process.env.ANTHROPIC_API_KEY!,process.env.ANTHROPIC_MODEL!);
    const current=readWorkspace().cases.find(c=>c.id===caseId)!;
    spendingId=reserveSpend(`ai:${reserved.runId}`,current.merchantId,"ai",model.model).id;
    const value=await model.interpret(reserved.context);recordSpendOutcome(spendingId,"committed");
    return completeAiReply(reserved.runId,value,model.provider,model.model);
  }catch(error){if(spendingId)recordSpendOutcome(spendingId,"unknown");failAiDraft(reserved.runId);throw new Error(error instanceof ModelError?`Review AI request: ${error.message}`:"Review AI reply interpretation: it was rejected or the case changed. Hold remains; no automatic retry.");}
}
