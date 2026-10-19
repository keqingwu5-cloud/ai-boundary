'use strict';
// Candidate HTTP client for an explicitly deployed trusted API.
// Does not create credentials or automatically start an AI/ChatGPT session.
function createHttpTaskClient({baseUrl,tokenProvider,httpFetch=fetch}={}) {
  if(typeof tokenProvider!=='function' || typeof httpFetch!=='function')
    throw new TypeError('tokenProvider and HTTP fetch are required');
  let u;
  try{u=new URL(baseUrl);}catch{throw new TypeError('valid baseUrl required');}
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if((u.protocol!=='https:' && !(local && u.protocol==='http:')) ||
     u.username || u.password || u.pathname!=='/' || u.search || u.hash)
    throw new TypeError('HTTPS service root is required (HTTP only on loopback)');
  const origin=u.origin;
  async function post(action,payload={}) {
    const token=await tokenProvider(action);
    if(typeof token!=='string'||!token.trim())throw Error('authenticated token required');
    const response=await httpFetch(origin+'/v1/tasks/'+action,{
      method:'POST',headers:{'authorization':'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    let body;
    try{body=await response.json();}catch{throw Error('invalid task API response');}
    if(!response.ok){
      const error=new Error('task API request failed');
      error.code=typeof body?.error==='string'?body.error:'API_ERROR';
      throw error;
    }
    if(!Object.hasOwn(body,'data'))throw Error('missing task API data');
    return body.data;
  }
  return {
    receive:()=>post('receive'),
    execute:p=>post('execute',p),
    ack:p=>post('ack',p),
    fail:p=>post('fail',p)
  };
}
module.exports={createHttpTaskClient};
