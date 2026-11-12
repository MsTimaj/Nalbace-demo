import "server-only";
import {recordTransportReply} from "./store.ts";
export type ReplyEnvelope={eventId:string;originalProviderId:string;from:string;text:string};
export type InboundAdapter={provider:"resend"|"postmark"|"ses";accountBinding:string;authenticateAndNormalize:(raw:string,headers:Headers)=>Promise<ReplyEnvelope>};
// Provider selection is pending. A concrete adapter must verify the original
// signature/authentication and resolve real threading identifiers. An adapter
// that merely parses JSON does not satisfy this contract.
export async function receiveProviderReply(raw:string,headers:Headers,adapter:InboundAdapter){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>64000)throw new Error("Incoming event exceeds the supported size.");
 const envelope=await adapter.authenticateAndNormalize(raw,headers);
 return recordTransportReply({...envelope,provider:adapter.provider,binding:adapter.accountBinding});
}
