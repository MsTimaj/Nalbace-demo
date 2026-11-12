import "server-only";
export function requireLocalHeaders(headers:Pick<Headers,"get">){
  if(!["localhost:3000","127.0.0.1:3000"].includes(headers.get("host")??""))throw new Error("Local access required.");
}
export function requireLocalRequest(request:Request,write=false) {
  const hosts=["localhost:3000","127.0.0.1:3000"];
  requireLocalHeaders(request.headers);
  if(write&&!hosts.map(h=>`http://${h}`).includes(request.headers.get("origin")??""))throw new Error("Local origin required.");
}
