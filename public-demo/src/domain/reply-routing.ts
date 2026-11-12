import {simpleEmail} from "./email-delivery.ts";
export function replyAddress(mailbox:string,id:string){
 if(!/^[a-z0-9.]+@gmail\.com$/i.test(mailbox)||!/^[a-f0-9-]{36}$/.test(id))throw new Error("A base Gmail reply mailbox and attempt identity are required.");
 const address=mailbox.replace("@",`+nalbace-${id.replaceAll("-","")}@`);
 if(!simpleEmail(address))throw new Error("Reply address is too long.");return address.toLowerCase();
}
type Part={mimeType?:string;filename?:string;headers?:{name?:string;value?:string}[];body?:{data?:string;size?:number;attachmentId?:string};parts?:Part[]};
export function parseMailboxReply(raw:unknown,expectedAlias:string,expectedFrom:string,allowSelfSent=false){
 const m=raw as {id?:string;labelIds?:string[];payload?:Part;sizeEstimate?:number};
 if(!m||!m.id||!/^[a-f0-9]{1,64}$/i.test(m.id)||!m.payload||(m.sizeEstimate??0)>250000||m.labelIds?.some(x=>(x==="SENT"&&!allowSelfSent)||["DRAFT","SPAM","TRASH"].includes(x)))throw new Error("Unsupported incoming message.");
 const headers=m.payload.headers??[];
 const one=(name:string)=>{const values=headers.filter(h=>h.name?.toLowerCase()===name).map(h=>h.value??"");if(values.length!==1)throw new Error("Ambiguous reply headers.");return values[0];};
 const address=(value:string)=>{if(/[\r\n]/.test(value))throw new Error("Invalid address header.");const match=value.match(/^(?:[^<>]*<([^<>]+)>|([^<>\s]+))$/);const email=(match?.[1]??match?.[2]??"").trim();if(!simpleEmail(email))throw new Error("Unsupported address.");return email.toLowerCase();};
 if(address(one("from"))!==expectedFrom.toLowerCase()||address(one("to"))!==expectedAlias.toLowerCase())throw new Error("Reply sender or route does not match.");
 if(headers.some(h=>h.name?.toLowerCase()==="auto-submitted"&&h.value?.toLowerCase()!=="no"))throw new Error("Automated reply requires operator review.");
 let count=0;const texts:string[]=[];
 const walk=(part:Part,depth:number)=>{if(++count>30||depth>6)throw new Error("Message structure exceeds limits.");if(part.filename||part.body?.attachmentId)return;
 if(part.mimeType==="text/plain"&&part.body?.data){if(!/^[A-Za-z0-9_-]+={0,2}$/.test(part.body.data)||part.body.data.length>24000)throw new Error("Reply body exceeds limits.");texts.push(Buffer.from(part.body.data,"base64url").toString("utf8"));}
 for(const child of part.parts??[])walk(child,depth+1);};walk(m.payload,0);
 const text=texts.join("\n").trim();if(!text||text.length>4000||text.includes("\u0000"))throw new Error("A plain-text reply within 4,000 characters is required.");
 return {messageId:m.id,from:expectedFrom.toLowerCase(),to:expectedAlias.toLowerCase(),text};
}
