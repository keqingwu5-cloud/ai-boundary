'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=process.env.TESTENV_DATA_DIR;
if(process.env.CHILD_MODE==='ignore-term')process.on('SIGTERM',()=>{});
fs.appendFileSync(path.join(dir,'starts.txt'),process.pid+'\n');
if(process.env.CHILD_MODE==='fail')process.exitCode=1;
else setInterval(()=>{},1000);
