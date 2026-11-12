// Display only: preserve the full received text in storage and AI review context.
export function emailDisplay(text:string){
 const lines=text.split(/\r?\n/),boundary=lines.findIndex((line,i)=>i>0&&(/^On .+wrote:\s*$/.test(line)||/^>/.test(line)));
 if(boundary<0)return {message:text,earlier:""};
 const message=lines.slice(0,boundary).join("\n").trim();
 if(!message)return {message:text,earlier:""};
 return {message,earlier:lines.slice(boundary).join("\n").replace(/^> ?/gm,"").trim()};
}
