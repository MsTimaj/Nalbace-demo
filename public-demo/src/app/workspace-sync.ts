// Refresh saved application state only. This never calls PayPal or a paid provider.
export function workspaceSync<T>(read:(signal:AbortSignal)=>Promise<T>,apply:(value:T)=>void,failed:()=>void){
  let generation=0,mutations=0,disposed=false;
  let pending:AbortController|null=null;
  return {
    replace(value:T){if(!disposed){generation++;apply(value);}},
    beginMutation(){generation++;mutations++;let finished=false;return ()=>{if(!finished){finished=true;mutations--;generation++;}};},
    async refresh(){
      if(disposed||mutations||pending)return;
      const expected=generation,controller=new AbortController();pending=controller;
      const timer=setTimeout(()=>controller.abort(),8000);
      try{const value=await read(controller.signal);if(!disposed&&!mutations&&generation===expected)apply(value);}
      catch{if(!disposed&&generation===expected)failed();}
      finally{clearTimeout(timer);if(pending===controller)pending=null;}
    },
    dispose(){disposed=true;generation++;pending?.abort();}
  };
}
