'use strict';
const fs=require('node:fs');const {reserve}=require('./receipt-ledger.cjs');
try{const inp=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(reserve(inp.dir,inp)));}
catch(e){process.stderr.write(String(e));process.exitCode=2;}
