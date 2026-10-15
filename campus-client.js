"use strict";
// Public Dify web-app access only. No model key, service API key, or user login is bundled.
(() => {
const ORIGIN='https://dify-app.zju.edu.cn';
const APP_CODE='QtF9797PfD1mnoZt';
const SESSION_KEY='zju_admission_public_session_v1';
let session='', passport='', passportExpiry=0, authPromise=null, busy=false;
function randomSession(){const a=crypto.getRandomValues(new Uint8Array(16));return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');}
try{session=localStorage.getItem(SESSION_KEY)||'';}catch{}
if(!/^[a-f0-9]{32}$/.test(session)){session=randomSession();try{localStorage.setItem(SESSION_KEY,session);}catch{}}
function publicError(message){const e=new Error(message);e.public=true;return e;}
function errorFor(status){return publicError(status===429?'当前咨询较多，请稍后再试。':status===401||status===403?'连接已失效，请重新连接后再发送。':status===404||status===400?'当前对话无法继续，请新建对话。':'问答服务暂时不可用，请稍后手动重试。');}
async function authenticate(){
 if(passport&&Date.now()<passportExpiry)return passport;
 if(authPromise)return authPromise;
 authPromise=(async()=>{
  const r=await fetch(ORIGIN+'/api/passport?user_id=zju-public-'+session,{credentials:'omit',redirect:'error',headers:{'X-App-Code':APP_CODE},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw errorFor(r.status);
  const j=await r.json();if(typeof j.access_token!=='string'||j.access_token.length<16||j.access_token.length>10000)throw publicError('连接返回异常，请稍后重试。');
  passport=j.access_token;passportExpiry=Date.now()+20*60*1000;return passport;
 })();
 try{return await authPromise;}finally{authPromise=null;}
}
const STREAM_LIMITS = Object.freeze({timeoutMs:90000, maxBytes:8*1024*1024, maxEventBytes:2*1024*1024, maxAnswerBytes:64*1024, maxEvents:4096});
const conversationPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class StreamFailure extends Error {constructor(...args){super(...args);this.name='StreamFailure';}}
const safeErrorNames=new Set(['AbortError','TimeoutError','TypeError','Error','RangeError','SyntaxError','StreamFailure']);
const safeNetworkCodes=new Set(['ECONNRESET','ETIMEDOUT','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','EPROTO','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID']);
function networkCategory(error){const code=error?.cause?.code;return safeNetworkCodes.has(code)?code:'unknown';}
function safeDiagnostic(stage,error){
  // Fixed, bounded labels only: never error.message, request/response content,
  // headers, credentials, user/session IDs, or the user's question.
  try{console.warn(JSON.stringify({tag:'zju-dify-upstream-failure',stage,error_name:safeErrorNames.has(error?.name)?error.name:'OtherError',network_category:networkCategory(error)}));}catch{}
}
function readWithAbort(reader, signal) {
  if(!signal)return reader.read();
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{
    const abort=()=>{void reader.cancel().catch(()=>{});reject(new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    reader.read().then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function readDifySSE(response, signal, limits=STREAM_LIMITS) {
  if(!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/event-stream') || !response.body)throw new StreamFailure();
  const reader=response.body.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});const encoder=new TextEncoder();
  let bytes=0, events=0, buffered='', dataLines=[], eventName='', eventBytes=0;
  let answer='', conversationId='', messageId='', complete=false, exhausted=false;
  const bindIds=payload=>{
    if(payload.conversation_id!==undefined){
      if(typeof payload.conversation_id!=='string' || !conversationPattern.test(payload.conversation_id) || (conversationId && conversationId!==payload.conversation_id))throw new StreamFailure();
      conversationId=payload.conversation_id;
    }
    const nextId=payload.message_id ?? payload.id;
    if(nextId!==undefined){
      if(typeof nextId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(nextId) || (messageId && messageId!==nextId))throw new StreamFailure();
      messageId=nextId;
    }
  };
  const dispatch=()=>{
    const lines=dataLines, name=eventName;dataLines=[];eventName='';eventBytes=0;
    if(!lines.length)return;
    if(++events>limits.maxEvents)throw new StreamFailure();
    // A named node/workflow/keepalive event is never an answer. For Dify's
    // usual data-only events, inspect only the event tag and answer fields.
    if(name && !['message','message_replace','message_end','error'].includes(name))return;
    let payload;try{payload=JSON.parse(lines.join('\n'));}catch{throw new StreamFailure();}
    if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new StreamFailure();
    const event=payload.event ?? name;
    if(typeof event!=='string' || (name && name!==event))throw new StreamFailure();
    if(event==='error')throw new StreamFailure();
    if(!['message','message_replace','message_end'].includes(event))return;
    bindIds(payload);
    if(event==='message_end'){
      if(!answer.trim() || !conversationId || !messageId)throw new StreamFailure();
      complete=true;return;
    }
    if(typeof payload.answer!=='string')throw new StreamFailure();
    answer=event==='message_replace'?payload.answer:answer+payload.answer;
    if(encoder.encode(answer).byteLength>limits.maxAnswerBytes)throw new StreamFailure();
  };
  const feed=text=>{
    buffered+=text;
    let newline;
    while(!complete && (newline=buffered.indexOf('\n'))!==-1){
      const rawLine=buffered.slice(0,newline);buffered=buffered.slice(newline+1);
      eventBytes+=encoder.encode(rawLine).byteLength+1;
      if(eventBytes>limits.maxEventBytes)throw new StreamFailure();
      const line=rawLine.endsWith('\r')?rawLine.slice(0,-1):rawLine;
      if(!line){dispatch();continue;}
      if(line.startsWith(':'))continue;
      const colon=line.indexOf(':');const field=colon===-1?line:line.slice(0,colon);
      let value=colon===-1?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
      if(field==='data')dataLines.push(value);else if(field==='event')eventName=value;
    }
    if(!complete && eventBytes+encoder.encode(buffered).byteLength>limits.maxEventBytes)throw new StreamFailure();
  };
  try {
    while(!complete){
      const {value,done}=await readWithAbort(reader,signal);
      if(done){exhausted=true;feed(decoder.decode());break;}
      if(!(value instanceof Uint8Array))throw new StreamFailure();
      bytes+=value.byteLength;if(bytes>limits.maxBytes)throw new StreamFailure();
      feed(decoder.decode(value,{stream:true}));
    }
    // No answer is released on EOF without a fully delimited message_end.
    if(!complete)throw new StreamFailure();
    return {answer,conversation_id:conversationId,message_id:messageId};
  } catch(error) {
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    throw new StreamFailure('',{cause:{code:networkCategory(error)}});
  } finally {
    if(!exhausted)void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

function titles(answer){const line=answer.match(/^依据[：:]\s*(.+)$/m)?.[1]||'';return [...new Set([...line.matchAll(/《([^》\n]+)》/g)].map(x=>x[1]))].slice(0,12).map(title=>({title}));}
async function check(){try{await authenticate();return {ready:true,mode:'campus_public_web_api',policy_year:2026};}catch(e){return {ready:false,mode:'campus_public_web_api',message:e.public?e.message:'请连接校园网或学校 VPN 后重试。'};}}
async function send({query,conversation_id='',parent_message_id='',signal}){
 if(busy)throw publicError('上一条问题仍在处理中。');
 if(typeof query!=='string'||!query.trim()||query.trim().length>2000)throw publicError('请输入1至2000字的问题。');
 if(conversation_id&&!conversationPattern.test(conversation_id))throw publicError('会话标识无效，请新建对话。');
 if(conversation_id&&!conversationPattern.test(parent_message_id))throw publicError('对话上下文缺失，请新建对话。');
 busy=true;const start=performance.now();
 try{
  const token=await authenticate();if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const signals=[AbortSignal.timeout(STREAM_LIMITS.timeoutMs)];if(signal)signals.push(signal);const requestSignal=AbortSignal.any(signals);
  const r=await fetch(ORIGIN+'/api/chat-messages',{method:'POST',credentials:'omit',redirect:'error',signal:requestSignal,headers:{'Content-Type':'application/json','Accept':'text/event-stream','X-App-Code':APP_CODE,'X-App-Passport':token},body:JSON.stringify({inputs:{},query:query.trim(),conversation_id,response_mode:'streaming',parent_message_id:conversation_id?parent_message_id:null,files:[]})});
  if(!r.ok){if([401,403].includes(r.status)){passport='';passportExpiry=0;}throw errorFor(r.status);}
  const data=await readDifySSE(r,requestSignal);
  if(conversation_id&&data.conversation_id!==conversation_id)throw publicError('会话发生变化，请新建对话。');
  return {...data,citations:titles(data.answer),elapsed_seconds:Math.round((performance.now()-start)/100)/10};
 }catch(e){if(e.public||signal?.aborted)throw e;if(e instanceof StreamFailure)throw publicError('本次答复未完整返回，请手动重试。');throw publicError('连接超时或网络异常，请检查校园网后手动重试。');}
 finally{busy=false;}
}
window.ZJUTransport=Object.freeze({check,send});
})();
