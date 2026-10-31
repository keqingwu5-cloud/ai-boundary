"use strict";
/* Offline, read-only gate for an independent-memory static bundle.
 * A matching self-authored hash manifest is an integrity check only: it is
 * NOT a cryptographic release signature, security audit, or origin deployment. */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const expected=["index.html","manifest.json","memory-controls-core.js","memory-impact-core.js",
 "memory-workflow-core.js","memory-auto-drive-core.js","memory.html","memory.js"].sort();
const scriptFiles=new Set(expected.filter(x=>x.endsWith(".js")));
function verify(dir){
 if(typeof dir!=="string"||!dir.trim())throw Error("bundle_dir_required");
 const folder=path.resolve(dir);
 if(!fs.statSync(folder).isDirectory())throw Error("not_a_directory");
 const actual=fs.readdirSync(folder).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error("unexpected_bundle_files");
 const read=(name)=>{
   const file=path.join(folder,name);
   if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error("unsafe_file_type_"+name);
   return fs.readFileSync(file);
 };
 const manifest=JSON.parse(read("manifest.json").toString("utf8"));
 if(manifest.schema!=="ai-boundary.memory-v1-bundle.v0.1"||
    manifest.requiresDedicatedOrigin!==true||manifest.status!=="not-deployed"||
    !Array.isArray(manifest.files)||manifest.files.length!==expected.length-1)
   throw Error("bundle_manifest_invalid");
 const declared=new Set();
 for(const item of manifest.files){
   if(!item||!expected.includes(item.name)||item.name==="manifest.json"||
      declared.has(item.name)||!/^[a-f0-9]{64}$/.test(item.sha256||""))throw Error("manifest_entry_invalid");
   declared.add(item.name);
   const sha=crypto.createHash("sha256").update(read(item.name)).digest("hex");
   if(sha!==item.sha256)throw Error("bundle_hash_mismatch_"+item.name);
 }
 for(const name of expected)if(name!=="manifest.json"&&!declared.has(name))throw Error("manifest_entry_missing_"+name);
 const html=read("memory.html").toString("utf8");
 if(html!==read("index.html").toString("utf8"))throw Error("html_alias_mismatch");
 if(!html.includes("connect-src 'none'")||!html.includes("default-src 'none'")||
    !html.includes("script-src 'self'")||!html.includes("form-action 'none'")||
    !html.includes('name="referrer" content="no-referrer"'))throw Error("memory_csp_incomplete");
 if(/<iframe\b|<object\b|<embed\b|<base\b|<script\b(?![^>]*\bsrc=)/i.test(html))
   throw Error("untrusted_html_element");
 const srcs=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 if(srcs.length!==scriptFiles.size)throw Error("missing_or_extra_app_script");
 const seen=new Set();
 for(const src of srcs){
   if(!/^\.\/[a-z0-9-]+\.js\?v=[A-Za-z0-9]+$/.test(src))throw Error("unexpected_script_uri");
   const base=src.slice(2).split("?")[0];
   if(!scriptFiles.has(base)||seen.has(base))throw Error("unexpected_script_source");
   seen.add(base);
 }
 if(/\bhref\s*=|<iframe\b|<img\b|<link\b|\baction\s*=/i.test(html))
   throw Error("unreviewed_navigation_or_resource");
 const blockedJS=/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(|\bserviceWorker\s*\.\s*register\s*\(/;
 for(const file of scriptFiles){
   const js=read(file).toString("utf8");
   if(blockedJS.test(js))throw Error("unexpected_transport_in_"+file);
 }
 return {fileCount:expected.length,manifestStatus:manifest.status,
   independentOriginRequired:manifest.requiresDedicatedOrigin,transportLint:"clear"};
}
if(require.main===module){
 try{
  const index=process.argv.indexOf("--dir");
  if(index<0||!process.argv[index+1])throw Error("usage: node verify-memory-v1-bundle.cjs --dir <folder>");
  const report=verify(process.argv[index+1]);
  process.stdout.write(JSON.stringify({result:"candidate-static-gate-pass",...report})+"\n");
 }catch(error){process.stderr.write("bundle_verify_failed: "+error.message+"\n");process.exitCode=1;}
}
module.exports={verify};
