import "server-only";
import {OAuth2Client,CodeChallengeMethod} from "google-auth-library";
import {randomBytes,randomUUID,createHash,timingSafeEqual} from "node:crypto";
import {inboxConfiguration,inboxRedirect,inboxReadScope,savePendingInbox,consumePendingInbox,saveInboxConnection,readInboxConnection,clearInboxConnection} from "./gmail-inbox-vault.ts";
function client(){const c=inboxConfiguration();if(!c.setupReady)throw new Error("Review Inbox setup: Google app credentials are required first.");return new OAuth2Client({clientId:c.clientId,clientSecret:c.clientSecret,redirectUri:inboxRedirect,transporterOptions:{timeout:15000,retry:false}});}
export async function beginInboxConnection(){
  const c=inboxConfiguration(),oauth=client(),state=randomBytes(32).toString("base64url"),pkce=await oauth.generateCodeVerifierAsync();
  savePendingInbox({stateHash:createHash("sha256").update(state).digest("hex"),verifier:pkce.codeVerifier,expiresAt:Date.now()+10*60000,binding:c.binding});
  const url=oauth.generateAuthUrl({access_type:"offline",prompt:"consent select_account",scope:["openid","email",inboxReadScope],state,login_hint:c.expectedEmail,include_granted_scopes:false,code_challenge:pkce.codeChallenge,code_challenge_method:CodeChallengeMethod.S256});
  return {url,state};
}
export async function finishInboxConnection(code:string,state:string,cookieState:string){
  if(!code||code.length>4000||!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(cookieState)||!timingSafeEqual(Buffer.from(state),Buffer.from(cookieState)))throw new Error("Review Inbox connection: sign-in state did not match.");
  const config=inboxConfiguration(),pending=consumePendingInbox(state),oauth=client();
  try{
    const {tokens}=await oauth.getToken({code,codeVerifier:pending.verifier,redirect_uri:inboxRedirect});
    const scopes=tokens.scope?.split(" ")??[],allowed=["openid","email","https://www.googleapis.com/auth/userinfo.email",inboxReadScope];
    if(!tokens.id_token||!tokens.access_token||!tokens.refresh_token||!scopes.includes(inboxReadScope)||scopes.some(s=>!allowed.includes(s))){if(tokens.refresh_token)await oauth.revokeToken(tokens.refresh_token).catch(()=>{});throw new Error("Incomplete or excessive Inbox permission.");}
    const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:config.clientId}),identity=ticket.getPayload();
    if(!identity?.email_verified||!identity.email||identity.email.toLowerCase()!==config.expectedEmail.toLowerCase()){await oauth.revokeToken(tokens.refresh_token).catch(()=>{});throw new Error("Unexpected Inbox account.");}
    saveInboxConnection({id:randomUUID(),email:identity.email,subject:identity.sub,binding:config.binding,refreshToken:tokens.refresh_token,accessToken:tokens.access_token,expiresAt:tokens.expiry_date??Date.now()+300000});
  }catch{throw new Error("Review Inbox connection: authorization was incomplete or the selected account did not match. No inbox access enabled.");}
}
export async function inboxAccess(){
  const saved=readInboxConnection();if(!saved)throw new Error("Review Inbox connection: sign in again.");
  if(saved.expiresAt>Date.now()+60000)return {token:saved.accessToken,id:saved.id,email:saved.email};
  try{
    const oauth=client();oauth.setCredentials({refresh_token:saved.refreshToken});const {token}=await oauth.getAccessToken();
    if(!token||readInboxConnection()?.id!==saved.id)throw new Error("Connection changed.");
    saveInboxConnection({...saved,accessToken:token,expiresAt:oauth.credentials.expiry_date??Date.now()+300000});return {token,id:saved.id,email:saved.email};
  }catch{throw new Error("Review Inbox connection: access could not be refreshed. No messages were read.");}
}
export async function disconnectInbox(){
  const saved=readInboxConnection();clearInboxConnection();if(!saved)return {revoked:true};
  try{await client().revokeToken(saved.refreshToken);return {revoked:true};}catch{return {revoked:false};}
}
