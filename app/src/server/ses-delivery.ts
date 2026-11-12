import "server-only";
import {createHash} from "node:crypto";
import {SESv2Client,SendEmailCommand} from "@aws-sdk/client-sesv2";
import type {SESv2ClientConfig} from "@aws-sdk/client-sesv2";
import {simpleEmail} from "../domain/email-delivery.ts";
import type {EmailAttempt} from "../domain/email-delivery.ts";
export const SES_CONFIGURATION_SET="my-first-configuration-set";

export type SesDiagnostic={category:"timeout"|"access-denied"|"unverified-identity"|"rejected"|"throttled"|"provider-error"|"invalid-response"|"connection-error";httpStatus?:number;requestId?:string};
export class SesDeliveryError extends Error{
  diagnostic:SesDiagnostic;
  constructor(diagnostic:SesDiagnostic){super("SES acceptance could not be confirmed.");this.diagnostic=diagnostic;}
}
export function safeSesDiagnostic(error:unknown):SesDiagnostic{
  const e=error&&typeof error==="object"?error as {name?:unknown;$metadata?:{httpStatusCode?:unknown;requestId?:unknown}}:{};
  const category:SesDiagnostic["category"]=e.name==="TimeoutError"||e.name==="AbortError"?"timeout":e.name==="AccessDeniedException"||e.name==="AccessDenied"?"access-denied":e.name==="MailFromDomainNotVerifiedException"?"unverified-identity":e.name==="MessageRejected"?"rejected":e.name==="TooManyRequestsException"||e.name==="ThrottlingException"?"throttled":e.$metadata?"provider-error":"connection-error";
  const status=e.$metadata?.httpStatusCode,id=e.$metadata?.requestId;
  // Never retain raw error messages, stacks, headers, credential IDs or bodies.
  return {category,...(typeof status==="number"&&Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{}),...(typeof id==="string"&&/^[a-f0-9-]{16,100}$/i.test(id)?{requestId:id}:{})};
}

export function sesConnection(env:Record<string,string|undefined>=process.env){
  // Dedicated app credentials only: never discover root/shared AWS profiles,
  // instance credentials, custom regions or environment-provided endpoints.
  const accessKeyId=env.NALBACE_SES_ACCESS_KEY_ID?.trim()??"",secretAccessKey=env.NALBACE_SES_SECRET_ACCESS_KEY?.trim()??"",sessionToken=env.NALBACE_SES_SESSION_TOKEN?.trim()||undefined;
  if(!/^[A-Z0-9]{16,128}$/.test(accessKeyId)||secretAccessKey.length<20||/[\r\n]/.test(secretAccessKey)||sessionToken&&/[\r\n]/.test(sessionToken))return null;
  const credentials={accessKeyId,secretAccessKey,sessionToken};
  const binding=createHash("sha256").update(JSON.stringify(["ses","us-east-2",SES_CONFIGURATION_SET,accessKeyId,secretAccessKey,sessionToken??""])).digest("hex");
  return {credentials,binding};
}

export function sesClientConfiguration(connection:NonNullable<ReturnType<typeof sesConnection>>):SESv2ClientConfig{
  return {region:"us-east-2",endpoint:"https://email.us-east-2.amazonaws.com",ignoreConfiguredEndpointUrls:true,credentials:connection.credentials,maxAttempts:1};
}

export async function submitSesTestEmail(attempt:EmailAttempt,connection:NonNullable<ReturnType<typeof sesConnection>>,requestHandler?:SESv2ClientConfig["requestHandler"]){
  if((attempt.replyTo!==undefined&&!simpleEmail(attempt.replyTo))||!simpleEmail(attempt.from)||!simpleEmail(attempt.to)||!attempt.subject.trim()||attempt.subject.length>200||/[\r\n]/.test(attempt.subject)||attempt.text.length>6000)throw new Error("Review exact email headers before delivery.");
  const client=new SESv2Client({...sesClientConfiguration(connection),...(requestHandler?{requestHandler}:{})});
  try{
    // SES SendEmail has no idempotency token. The durable application attempt
    // prevents repeat dispatch; even a timeout consumes it, without SDK retry.
    const response=await client.send(new SendEmailCommand({ConfigurationSetName:SES_CONFIGURATION_SET,FromEmailAddress:attempt.from,...(attempt.replyTo?{ReplyToAddresses:[attempt.replyTo]}:{}),Destination:{ToAddresses:[attempt.to]},Content:{Simple:{Subject:{Data:attempt.subject,Charset:"UTF-8"},Body:{Text:{Data:attempt.text,Charset:"UTF-8"}}}}}),{abortSignal:AbortSignal.timeout(15000)});
    if(typeof response.MessageId!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(response.MessageId))throw new SesDeliveryError({category:"invalid-response"});
    return response.MessageId;
  }catch(error){throw error instanceof SesDeliveryError?error:new SesDeliveryError(safeSesDiagnostic(error));}
  finally{client.destroy();}
}
