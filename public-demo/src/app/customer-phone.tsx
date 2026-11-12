
import {useState} from "react";
import type {ClientCase} from "../domain/cases.ts";
import Icon from "./ui-icon.tsx";
import {manualCallTarget} from "../domain/manual-call.ts";
export default function CustomerPhone({client}:{client:ClientCase}){
 const [show,setShow]=useState(false),phone=client.contactPermission?.phone??"",valid=/^\+[1-9]\d{6,14}$/.test(phone),stopped=client.hold==="suppressed",target=null;
 function edit(){const section=document.getElementById("contact-permissions");section?.setAttribute("open","");section?.scrollIntoView({block:"start",behavior:"instant"});section?.focus({preventScroll:true});}
 return <div className="customer-phone">{valid?<><span className="customer-phone-number">{show?phone:`••• ••• ${phone.slice(-4)}`}</span><button className="text-button" aria-label={show?"Hide customer phone number":"Show customer phone number"} onClick={()=>setShow(!show)}>{show?"Hide":"Show"}</button>{target?<a className="customer-call" href={target} aria-label="Call customer manually"><span className="silver-icon"><Icon name="phone"/></span>Call manually</a>:<span className="hint">{stopped?"Contact stopped":"Fictional sample number · no real calls"}</span>}</>:<button className="text-button" onClick={edit}><span className="silver-icon"><Icon name="phone"/></span>Add customer phone</button>}</div>;
}
