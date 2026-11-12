
import {useEffect,useState} from "react";
import Icon from "./ui-icon.tsx";
type Status={setupReady:boolean;connected:boolean;account:string|null;permission:string};
export default function GmailPanel(){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){try{const r=await fetch("/api/gmail-connection",{cache:"no-store"});if(!r.ok)throw new Error();setStatus(await r.json());}catch{setError("Gmail status could not be checked.");}}
  useEffect(()=>{void load();},[]);
  async function action(action:"connect"|"disconnect"){
    setBusy(true);setError("");
    try{const r=await fetch("/api/gmail-connection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})}),v=await r.json();if(!r.ok)throw new Error(v.error);
      if(action==="connect"){const url=new URL(v.url);if(url.origin!=="https://accounts.google.com")throw new Error("Google sign-in could not be opened.");window.location.assign(url.href);}
      else{await load();if(!v.revoked)setError("Disconnected from this app. Google could not confirm revocation; remove Nalbace in your Google account permissions as well.");}
    }catch(e){setError(e instanceof Error?e.message:"Gmail setup failed.");}finally{setBusy(false);}
  }
  return <section className="card connection"><h2 className="section-title"><span className="silver-icon"><Icon name="mail"/></span>Gmail<span>{!status?"Checking setup":status.connected?"Connected · sending off":status.setupReady?"Ready to connect":"Google app setup needed"}</span></h2>
    <p>{status?.connected?`${status.account} is connected for sending only. Reminders still require an enabled allowance, fresh payment evidence and exact approval.`:"Connect the Gmail account you choose for testing. A dedicated Nalbace account can keep it separate from your personal and business mail."}</p>
    <p className="hint">Nalbace requests permission to send, plus your Google email identity. It cannot read, delete or manage your inbox with this connection. Review replies by pasting them into the client page for now.</p>
    {status?.connected?<button className="secondary full" disabled={busy} onClick={()=>void action("disconnect")}>Disconnect Gmail</button>:<button className="secondary full" disabled={busy||!status?.setupReady} onClick={()=>void action("connect")}>Connect Gmail with Google</button>}
    {status&&!status.setupReady&&<p className="hint">One-time Google application setup is needed before sign-in can open. No Google password or app password belongs in Nalbace or this chat.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
