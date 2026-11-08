import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const release=path.resolve('audit-current');
const backup=path.resolve('audit-previous');
const maintenance=path.resolve('audit-maintenance');
const allowed=['.nojekyll','gap-aware-composition.mjs','index.html','nary-composition.mjs','nary-transform.mjs','pilot-manifest.json','preview/app.mjs','preview/index.html','preview/pilot-core.mjs'].sort();
const expected={
  'preview/index.html':'0b3916a16738e9848be892f2fecd5925fd8f684b',
  'preview/app.mjs':'3838b4311d281e82638ade303ab7d344a0037b65',
  'preview/pilot-core.mjs':'8af53e8823c4b2f73bb5eb80d28c2d584902ae44'
};
function shaBlob(data){
  return crypto.createHash('sha1').update(Buffer.from('blob '+data.byteLength+'\0')).update(data).digest('hex');
}
function listFiles(dir,root=dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    if(e.name==='.git')return [];
    const f=path.join(dir,e.name);
    return e.isDirectory()?listFiles(f,root):[path.relative(root,f).split(path.sep).join('/')];
  }).sort();
}
test('01 exactly nine allowlisted static files, without private or main app assets',()=>{
  assert.deepEqual(listFiles(release),allowed);
  assert.deepEqual(listFiles(backup),allowed);
  for (const blocked of ['app.js','data.js','api','memory.js','launcher.html'])assert.ok(!fs.existsSync(path.join(release,blocked)));
});
test('02 published three changed files exactly match the reviewed source blobs',()=>{
  for(const [name,sha] of Object.entries(expected)){
    const published=fs.readFileSync(path.join(release,name));
    const reviewed=fs.readFileSync(path.resolve(name));
    assert.equal(shaBlob(published),sha,name);
    assert.deepEqual(published,reviewed,name+' differs from reviewed PR');
  }
});
test('03 unchanged V1.4/V1.5/V1.6 dependency code matches previous snapshot',()=>{
  for(const file of ['nary-composition.mjs','nary-transform.mjs','gap-aware-composition.mjs']){
    assert.deepEqual(fs.readFileSync(path.join(release,file)),fs.readFileSync(path.join(backup,file)),file);
    assert.deepEqual(fs.readFileSync(path.join(release,file)),fs.readFileSync(path.resolve(file)),file);
  }
});
test('04 release rejects blank-to-zero conversion and invalidates stale evidence',()=>{
  const app=fs.readFileSync(path.join(release,'preview/app.mjs'),'utf8');
  assert.match(app,/function requiredInteger/);
  assert.match(app,/if\(raw===''?\)/);
  assert.match(app,/function inputsChanged/);
  assert.match(app,/\$\('export'\)\.disabled=true/);
  const html=fs.readFileSync(path.join(release,'preview/index.html'),'utf8');
  assert.match(html,/留空不等於 0/);
  assert.match(html,/請勿輸入私人或敏感資訊/);
});
test('05 prior backup reproduces old unsafe parsing, never call it a safe rollback',()=>{
  const old=fs.readFileSync(path.join(backup,'preview/app.mjs'),'utf8');
  assert.match(old,/Number\(\$\('a'\)\.value\)/);
  assert.equal(Number(''),0);
  console.log('OLD_BACKUP_IS_NOT_SAFE_ROLLBACK; use disable-Pages or safe maintenance instead');
});
test('06 release manifest tracks original pilot, not this release; require human review',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(release,'pilot-manifest.json'),'utf8'));
  assert.equal(manifest.type,'synthetic-read-only-pilot');
  assert.equal(manifest.source_head,'23d9845039a19015f671f512a1de4dba05c2f752');
  assert.equal(manifest.production_writes,false);
  console.log('MANIFEST_SOURCE_HEAD_OUTDATED: manifest points to PR127, release is PR129');
});

test('07 emergency maintenance candidate has no executable UI (NOT DEPLOYED)',()=>{
  assert.deepEqual(listFiles(maintenance),allowed);
  const maintenanceHtml=fs.readFileSync(path.join(maintenance,'preview/index.html'),'utf8');
  const maintenanceRoot=fs.readFileSync(path.join(maintenance,'index.html'),'utf8');
  assert.match(maintenanceHtml,/隔離試用功能已暫停/);
  assert.doesNotMatch(maintenanceHtml,/<script/i);
  assert.doesNotMatch(maintenanceHtml,/<input|<form|<button/i);
  assert.equal(shaBlob(Buffer.from(maintenanceHtml)),'c4feba343bd4babcad1a24eed56697f05690d355');
  assert.equal(shaBlob(Buffer.from(maintenanceRoot)),'f59bc0d7b2a2e8058a9cd7e12d2c14afd8f5c95e');
  console.log('MAINTENANCE_ISOLATED_CANDIDATE_ONLY; gh-pages NOT CHANGED');
});
