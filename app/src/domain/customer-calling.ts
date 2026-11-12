import type {ClientCase} from "./cases.ts";

export function customerAllowsAiCalls(client:ClientCase){
  return client.aiCallPreference==="allow"&&client.contactPermission?.voiceAllowed===true;
}
