// Preserve bounded transcript evidence, not an invented dispute explanation.
export function voiceDisputeExcerpt(turns:{role:string;content:string}[]){
 const index=turns.findIndex(t=>t.role==="user"&&/\bdisput|not my invoice|wrong amount/i.test(t.content));
 if(index<0)return undefined;
 const parts=[turns[index].content];
 const question=turns.findIndex((t,i)=>i>index&&t.role==="agent"&&/what.*disput|reason|explain.*disput|tell me.*disput/i.test(t.content));
 if(question>=0){const answer=turns.slice(question+1).find(t=>t.role==="user");if(answer)parts.push(answer.content);}
 return parts.join("\n").slice(0,1000);
}
