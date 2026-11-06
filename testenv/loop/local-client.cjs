'use strict';
// Same authenticated API methods as the HTTP client, for isolated in-process use.
function createLocalClient({api,tokenProvider}) {
 const scopes={receive:'tasks:receive',intent:'tasks:execute',authorize:'tasks:execute',execute:'tasks:execute',ack:'tasks:ack',fail:'tasks:execute',report:'tasks:report',status:'tasks:status'};
 const client={};
 for(const [method,scope] of Object.entries(scopes)){
  if(typeof api[method]!=='function')throw new TypeError('missing API method: '+method);
  client[method]=async(p={})=>api[method]({headers:{authorization:'Bearer '+await tokenProvider([scope])},...(method==='status'?{params:p}:{body:p})});
 }
 return client;
}
module.exports={createLocalClient};
