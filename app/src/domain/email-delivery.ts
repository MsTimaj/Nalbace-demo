export type EmailAttempt={id:string;caseId:string;draftId:string;approvalId:string;at:string;from:string;to:string;subject:string;text:string;state:"reserved"|"accepted"|"unknown"|"blocked";providerId?:string;deliveryProvider?:string;deliveryBinding?:string;replyTo?:string;receivedCopy?:{at:string;mailboxBinding:string;messageId:string}};
export function simpleEmail(value:unknown):value is string{
  if(typeof value!=="string"||value.length>254||/[\r\n]/.test(value))return false;
  const parts=value.split("@");if(parts.length!==2)return false;const [local,domain]=parts;
  return local.length<=64&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)&&!local.startsWith(".")&&!local.endsWith(".")&&!local.includes("..")&&domain.includes(".")&&domain.split(".").every(label=>label.length<=63&&/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}
