import {approveFollowupRehearsal,advanceFollowupRehearsal,saveCustomerCalling,saveCustomerFollowup,saveReminderPolicy,tickAutomaticReminders} from "../../../server/store.ts";
import {savePriorityPreference,saveFollowupPreference,editClientDetails,reviewDispute,prepareVoiceReview} from "../../../server/store.ts";
import {reviewSelfTestVoice,approveSelfTestVoice,callSelfTestVoice} from "../../../server/voice-test-workflow.ts";
import { NextRequest, NextResponse } from "next/server";
import { readWorkspace, prepareDraft, approveDraft, recordReceipt, confirmClearance, setPause,refreshSandboxCase,reconcileReceipt,recordCustomerUpdate,resolveInterruptedAiDraft,saveContactPermission,voidReceipt,saveWorkspaceControls,saveAiPreference } from "../../../server/store.ts";
import {prepareAiDraft,interpretSavedReply} from "../../../server/ai-drafting.ts";
import {recordPastedReply,resolveReceiptCorrections} from "../../../server/store.ts";
import {deliverApprovedTestEmail} from "../../../server/email-delivery.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function local(request:NextRequest,write=false) {
  // Next may normalize its internal URL to localhost. Check the explicit local
  // deployment allowlist, including Host, rather than that normalized URL.
  const hosts=["localhost:3000","127.0.0.1:3000"];
  if(!hosts.includes(request.headers.get("host")??""))throw new Error("This sample workspace is local-only.");
  if(write){const origin=request.headers.get("origin");if(!hosts.map(h=>`http://${h}`).includes(origin??""))throw new Error("Request origin is not allowed.");}
}
export async function GET(request:NextRequest) {
  try {local(request);return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});}
  catch{return NextResponse.json({error:"Workspace unavailable."},{status:403});}
}
export async function POST(request:NextRequest) {
  try {
    local(request,true);
    const text=await request.text();if(text.length>18000)throw new Error("The request is too large.");
    const v=JSON.parse(text);if(!v||typeof v!=="object")throw new Error("Enter a valid action.");
    if(v.action==="reminder-policy"){if(!v.policy||typeof v.policy!=="object")throw new Error("Enter a reminder policy.");saveReminderPolicy(v.policy,v.revision);return NextResponse.json(readWorkspace());}
    if(v.action==="automation-tick"){tickAutomaticReminders();return NextResponse.json(readWorkspace());}
    if(v.action==="priority-preference"){savePriorityPreference(v.days,v.revision);return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});}
    if(v.action==="followup-preference"){
      saveFollowupPreference(v.channel,v.paused,v.revision);
      return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});
    }
    if(v.action==="ai-preference"){
      saveAiPreference(v.paused,v.revision);
      return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});
    }
    if(v.action==="settings"){
      if(!v.controls||typeof v.controls!=="object")throw new Error("Enter valid settings.");
      saveWorkspaceControls(v.controls);
      return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});
    }
    if(typeof v.caseId!=="string"||v.caseId.length>64)throw new Error("Choose a valid client.");
    switch(v.action) {
      case "customer-followup":saveCustomerFollowup(v.caseId,v.version,v.emailEnabled,v.callEnabled);break;
      case "customer-calling":saveCustomerCalling(v.caseId,v.version,v.allow);break;
      case "edit-client-details":
        editClientDetails(v.caseId,v.version,{name:v.name,email:v.email,phone:v.phone,operationId:v.operationId});break;
      case "review-dispute":
        reviewDispute(v.caseId,v.version,{resolution:v.resolution,note:v.note,reference:v.reference,nextAction:v.nextAction,reviewAt:v.reviewAt,operationId:v.operationId});break;
      case "prepare-voice-review":
        if(!Number.isSafeInteger(v.version))throw new Error("Review the current case version.");
        if(v.caseId==="sandbox-voice-test")await reviewSelfTestVoice(v.caseId);else prepareVoiceReview(v.caseId,v.version);break;
      case "approve-voice-test":
        if(typeof v.reviewId!=="string")throw new Error("Review current call facts first.");
        approveSelfTestVoice(v.caseId,v.reviewId);break;
      case "call-voice-test":
        if(typeof v.approvalId!=="string")throw new Error("Approve the exact test call first.");
        await callSelfTestVoice(v.caseId,v.approvalId);break;
      case "resolve-receipt-corrections":
        if(typeof v.note!=="string"||!Number.isSafeInteger(v.version))throw new Error("Enter a valid corrections review.");
        resolveReceiptCorrections(v.caseId,v.version,v.note);break;
      case "send-test-email":
        if(typeof v.draftId!=="string"||typeof v.approvalId!=="string")throw new Error("Exact owner approval is required.");
        await deliverApprovedTestEmail(v.caseId,v.draftId,v.approvalId);break;
      case "paste-reply":
        if(typeof v.text!=="string"||typeof v.operationId!=="string")throw new Error("Enter a reply and valid operation.");
        recordPastedReply(v.caseId,v.text,v.operationId);break;
      case "interpret-reply":
        if(typeof v.replyId!=="string")throw new Error("Choose a saved reply.");
        await interpretSavedReply(v.caseId,v.replyId);break;
      case "contact-permission":
        if(!v.permission||typeof v.permission!=="object"||!Number.isSafeInteger(v.version))throw new Error("Enter valid contact permissions.");
        saveContactPermission(v.caseId,v.version,v.permission);break;
      case "void-receipt":
        if(typeof v.receiptId!=="string"||typeof v.reason!=="string"||!Number.isSafeInteger(v.version))throw new Error("Enter a valid receipt correction.");
        voidReceipt(v.caseId,v.receiptId,v.reason,v.version);break;
      case "ai-draft":await prepareAiDraft(v.caseId);break;
      case "resolve-ai":
        if(typeof v.runId!=="string")throw new Error("Choose an interrupted request.");
        // Bind interruption resolution to the case requested by this local owner.
        if(!readWorkspace().aiRuns?.some(r=>r.id===v.runId&&r.caseId===v.caseId))throw new Error("Draft request not found in this case.");
        resolveInterruptedAiDraft(v.runId);break;
      case "customer-update":
        if(!["payment-claim","promise","dispute","stop","relationship-concern","relationship-resolved"].includes(v.kind)||typeof v.note!=="string"||typeof v.operationId!=="string"||(v.followUpAt!==null&&typeof v.followUpAt!=="string"))throw new Error("Enter a valid customer update.");
        recordCustomerUpdate(v.caseId,v.kind,v.note,v.followUpAt,v.operationId);break;
      case "refresh-evidence":await refreshSandboxCase(v.caseId);break;
      case "reconcile":
        if(typeof v.receiptId!=="string"||!Array.isArray(v.matches)||v.matches.length>20||!v.matches.every((m:unknown)=>m&&typeof m==="object"&&"invoiceId" in m&&typeof m.invoiceId==="string"&&"paymentId" in m&&typeof m.paymentId==="string"))throw new Error("Receipt needs exact payment matches.");
        reconcileReceipt(v.caseId,v.receiptId,v.matches);break;
      case "approve-workflow":
        if(typeof v.draftId!=="string"||typeof v.subject!=="string"||typeof v.body!=="string")throw new Error("Review the complete workflow before approving.");
        approveFollowupRehearsal(v.caseId,v.draftId,v.subject,v.body);break;
      case "advance-workflow":
        if(typeof v.planId!=="string"||!Number.isSafeInteger(v.day))throw new Error("Choose a scheduled rehearsal step.");
        advanceFollowupRehearsal(v.caseId,v.planId,v.day);break;
      case "draft":prepareDraft(v.caseId);break;
      case "approve":
        if(typeof v.draftId!=="string"||typeof v.subject!=="string"||typeof v.body!=="string")throw new Error("A complete draft is required.");
        approveDraft(v.caseId,v.draftId,v.subject,v.body);break;
      case "receipt":
        if(!["cash","check"].includes(v.kind)||!Array.isArray(v.allocations)||v.allocations.length>20)throw new Error("Enter a valid receipt.");
        if(!v.allocations.every((a:unknown)=>a&&typeof a==="object"&&"invoiceId" in a&&typeof a.invoiceId==="string"&&"amountMinor" in a&&Number.isSafeInteger(a.amountMinor)))throw new Error("Enter exact invoice allocations.");
        if(typeof v.operationId!=="string")throw new Error("A valid receipt operation is required.");
        recordReceipt(v.caseId,v.kind,v.allocations,v.operationId);break;
      case "clear":if(typeof v.receiptId!=="string")throw new Error("Choose a check.");confirmClearance(v.caseId,v.receiptId,v.checkNumber as string|undefined);break;
      case "pause":if(typeof v.paused!=="boolean")throw new Error("Choose a valid pause action.");setPause(v.caseId,v.paused);break;
      default:throw new Error("That action is not supported.");
    }
    return NextResponse.json(readWorkspace(),{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"The action could not be completed.";
    // Don't expose provider errors, database paths, tokens or stack traces.
    const safe=/^(Choose|Enter|A complete|A receipt|A valid|Amounts|Receipt|An invoice|An owner|Approval|Billing|Check|Client|Contact|Covered|Draft|Exact|Invoice|Merchant|No remaining|Pending|Request origin|Sample|The approved|The billing|The case|The last|The request|The action|This exception|This sample|That action|Verify|Waiting|Review)/.test(message)?message:"The action could not be completed. Refresh and review the case.";
    return NextResponse.json({error:safe},{status:400});
  }
}
