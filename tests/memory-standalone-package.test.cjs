"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process"),crypto=require("node:crypto");
const script=path.resolve(__dirname,"../scripts/package-memory-v1.cjs");
function build(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"synthetic-memory-bundle-"));
 const dest=path.join(folder,"bundle");
 const result=cp.spawnSync(process.execPath,[script,"--out",dest],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
 return {folder,dest};
}
test("bundle contains only existing memory app resources and a verifiable manifest",()=>{
 const {folder,dest}=build();
 try{
  const actual=fs.readdirSync(dest).sort();
  assert.deepEqual(actual,["index.html","manifest.json","memory-controls-core.js","memory-impact-core.js","memory-workflow-core.js","memory.html","memory.js"].sort());
  const manifest=JSON.parse(fs.readFileSync(path.join(dest,"manifest.json"),"utf8"));
  assert.equal(manifest.requiresDedicatedOrigin,true);
  assert.equal(manifest.status,"not-deployed");
  for(const entry of manifest.files){
    const sha=crypto.createHash("sha256").update(fs.readFileSync(path.join(dest,entry.name))).digest("hex");
    assert.equal(sha,entry.sha256,"content hash "+entry.name);
  }
  const html=fs.readFileSync(path.join(dest,"memory.html"),"utf8");
  assert.equal(html,fs.readFileSync(path.join(dest,"index.html"),"utf8"));
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/script-src 'self'/);
  assert.doesNotMatch(html,/href="\.\/(?:mainbrain|launcher|feed)\.html"/);
  assert.match(html,/memory-impact-core\.js/);
  assert.doesNotMatch(html,/<script[^>]*src="https?:\/\//);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("bundler refuses stale contents rather than retaining unrelated public platform files",()=>{
 const {folder,dest}=build();
 try{
  fs.writeFileSync(path.join(dest,"launcher.html"),"EXTRA_PAGE_SHOULD_NOT_SHIP");
  const r=cp.spawnSync(process.execPath,[script,"--out",dest],{encoding:"utf8"});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/destination_not_empty/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
