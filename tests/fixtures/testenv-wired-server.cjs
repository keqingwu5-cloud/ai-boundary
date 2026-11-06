'use strict';
// Real server, real FileStore and real worker; IPC only exposes the bound port.
const {server}=require('../../testenv/loop/server.cjs');
server.on('listening',()=>process.send({port:server.address().port}));
