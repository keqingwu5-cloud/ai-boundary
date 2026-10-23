"use strict";
/* Local, deployment-free packaging for a dedicated memory-only origin.
 * Do not treat directory isolation as browser origin isolation. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const outIndex=process.argv.indexOf("--out");
const dest=outIndex>=0?path.resolve(process.argv[outIndex+1]):path.join(root,".memory-v1-bundle");
if(dest===root||root.startsWith(dest+path.sep))throw Error("unsafe_destination");
const filenames=["memory.html","memory.js","memory-controls-core.js","memory-workflow-core.js","memory-impact-core.js"];
for(const file of filenames)if(!fs.existsSync(path.join(root,file)))throw Error("missing_source_"+file);
fs.mkdirSync(dest,{recursive:true});
const html=fs.readFileSync(path.join(root,"memory.html"),"utf8");
const isolated=html.replace(/<header><nav>[\s\S]*?<\/nav><\/header>/,
  '<header><nav><strong>記憶體體系 · 獨立管理</strong></nav></header>');
if(isolated===html)throw Error("navigation_isolation_missing");
if(!isolated.includes("connect-src 'none'")||!isolated.includes("script-src 'self'"))throw Error("csp_not_present");
if(/<script[^>]*src=["'](?:https?:|\/\/)/i.test(isolated))throw Error("remote_script_forbidden");
if(/href=["']\.\/(?:mainbrain|launcher|feed|index)\.html/i.test(isolated))throw Error("public_navigation_reference");
const allowedScriptNames=new Set(filenames.filter(n=>n.endsWith(".js")));
for(const match of isolated.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)){
 const file=match[1].replace(/^\.\//,"").split("?")[0];
 if(!allowedScriptNames.has(file))throw Error("unexpected_script_"+file);
}
const outputs={...Object.fromEntries(filenames.filter(n=>n!=="memory.html").map(name=>[name,fs.readFileSync(path.join(root,name))])),
  "memory.html":Buffer.from(isolated),"index.html":Buffer.from(isolated)};
for(const [name,buffer] of Object.entries(outputs))fs.writeFileSync(path.join(dest,name),buffer);
const manifest={schema:"ai-boundary.memory-v1-bundle.v0.1",source:"candidate-only",status:"not-deployed",requiresDedicatedOrigin:true,
 files:Object.entries(outputs).map(([name,buffer])=>({name,sha256:crypto.createHash("sha256").update(buffer).digest("hex")}))};
fs.writeFileSync(path.join(dest,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
process.stdout.write("Bundled "+manifest.files.length+" static files; independent host/origin NOT provisioned.\n");
