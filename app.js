"use strict";
(() => {
 const $=id=>document.getElementById(id);
 let chats=[], activeId=null, busy=false, ready=false, leaving=false, aborter=null, deleteId=null, toastTimer, sourcesPromise, newDraft='';
 // Conversations belong only to this open page; a reload starts empty.
 const maxChats=20, maxMessages=40;
 // The visitor profile is the only thing persisted, under one dedicated key.
 const P=window.ZJUProfile;
 const initialProfile=P?P.load():null;
 let profile=initialProfile?initialProfile.profile:null;
 let profileStored=initialProfile?initialProfile.stored:false;
 // The current public workflow returns a fixed intake card on the first turn.
 // One automatic re-ask makes the visitor's actual question reach the real flow.
 const INTAKE_REASK=true;
 let intakeReasks=0;
 function uid(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
 function text(value,max=50000){return typeof value==='string'?value.slice(0,max):'';}
 function active(){return chats.find(x=>x.local_id===activeId);}
 function element(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
 function icon(name){const img=element('img');img.src='./'+name+'.svg';img.alt='';return img;}
 function toast(message){if(leaving)return;$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
 function profileEmpty(){return !profile||!P||P.isEmpty(profile);}
 function profileParts(){return profileEmpty()?[]:P.summary(profile);}
 function updatePill(){if(leaving||!$('profile-pill'))return;const parts=profileParts();$('profile-pill-label').textContent=parts.length?parts.slice(0,2).join(' · '):'我的画像';$('profile-pill').classList.toggle('set',parts.length>0);$('profile-pill').setAttribute('aria-label',parts.length?'查看或修改来访者画像：'+parts.join('，'):'填写来访者画像');}
 function updateChip(){if(leaving||!$('profile-chip'))return;const parts=profileParts();const show=parts.length>0&&(active()?.messages.length||0)>0;$('profile-chip').hidden=!show;if(show){$('profile-chip-text').textContent=parts.join(' · ')+(profile.carry===false?'（本轮不携带）':'');}}
 function saveDraft(){if(leaving||busy)return;const chat=active();if(chat)chat.draft=$('question').value;else newDraft=$('question').value;}
 function selectChat(id){if(busy||leaving)return;saveDraft();activeId=id;$('question').value=active()?.draft||'';$('error').hidden=true;render();closeDrawer();}
 function newChat(){if(busy||leaving)return;saveDraft();activeId=null;$('question').value=newDraft;$('error').hidden=true;render();closeDrawer();$('question').focus();}
 function updateControls(){if(leaving)return;$('send').disabled=busy||!ready||!$('question').value.trim();$('question').disabled=busy;$('stop').hidden=!busy;$('send').hidden=busy;$('new-chat').disabled=busy;$('export-chat').disabled=!active()?.messages.length;$('input-state').textContent=busy?'正在等待最终答复':'校园网 / 学校 VPN';document.querySelectorAll('.history-open,.history-delete,[data-question]').forEach(b=>b.disabled=busy);document.querySelectorAll('.message-retry').forEach(b=>b.disabled=busy||!ready);}
 function renderHistory(){const list=$('history');list.replaceChildren();for(const c of chats){const row=element('div','history-row'+(c.local_id===activeId?' active':''));const open=element('button','history-open',c.title);open.title=c.title;open.setAttribute('aria-label','打开对话：'+c.title);if(c.local_id===activeId)open.setAttribute('aria-current','true');open.onclick=()=>selectChat(c.local_id);const del=element('button','history-delete','×');del.setAttribute('aria-label','删除对话：'+c.title);del.onclick=()=>{if(busy||leaving)return;deleteId=c.local_id;$('delete-dialog').showModal();$('cancel-delete').focus();};row.append(open,del);list.append(row);}$('history-empty').hidden=chats.length>0;}
 function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function referenceTitle(value){return text(value,500).replace(/^\*\*|\*\*$/g,'').replace(/^《|》$/g,'').trim();}
 function inline(parent,s,references=[],names=[]){
  const re=/(\*\*([^*\n]+)\*\*)|(\[([^\]\n]+)\]\(([^\s)]+)\))|(《([^》\n]+)》)/g;let p=0;
  function reference(label,name){const a=element('a','citation-link',label);a.href='#';a.setAttribute('aria-label','查看资料：'+name);references.push({node:a,name,url:null});parent.append(a);}
  for(const m of s.matchAll(re)){
   parent.append(document.createTextNode(s.slice(p,m.index)));
   if(m[2]){const strong=element('strong');inline(strong,m[2],references,names);parent.append(strong);}
   else if(m[4]){const name=referenceTitle(m[4]);if(names.includes(name)||/^《.+》$/.test(m[4]))reference(m[4],name);else{const url=safeURL(m[5]);if(url){const a=element('a','',m[4]);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}else parent.append(document.createTextNode(m[4]));}}
   else reference(m[6],m[7]);
   p=m.index+m[0].length;
  }parent.append(document.createTextNode(s.slice(p)));
 }
 function markdown(answer,references=[],names=[]){const body=element('div','answer');let list=null,paragraph=null;for(const raw of answer.split('\n')){const line=raw.trimEnd();if(!line.trim()){list=null;paragraph=null;continue;}const ordered=line.match(/^\s*\d+[.、)]\s+(.+)/),unordered=line.match(/^\s*[-*]\s+(.+)/);if(ordered||unordered){const kind=ordered?'ol':'ul';if(!list||list.tagName.toLowerCase()!==kind){list=element(kind);body.append(list);}const li=element('li');inline(li,(ordered||unordered)[1],references,names);list.append(li);paragraph=null;}else{list=null;if(!paragraph){paragraph=element('p');body.append(paragraph);}else paragraph.append(element('br'));inline(paragraph,line.replace(/^#{1,6}\s+/,''),references,names);}}return body;}
 async function copy(value){const input=element('textarea');input.className='sr-only';input.value=value;document.body.append(input);input.select();let ok=false;try{ok=document.execCommand('copy');}catch{}input.remove();if(!ok){try{await Promise.race([navigator.clipboard.writeText(value),new Promise((_,reject)=>setTimeout(reject,1200))]);ok=true;}catch{}}toast(ok?'已复制':'复制未成功，请手动选择文字。');}
 function titles(message){
  const out=(Array.isArray(message.citations)?message.citations:[]).map(x=>referenceTitle(x?.title));
  for(const m of text(message.content).matchAll(/《([^》\n]+)》/g))out.push(m[1]);
  const basis=text(message.content).match(/^\s*(?:\*\*)?依据[：:]\s*(?:\*\*)?(.+)$/m)?.[1]||'';
  for(const m of basis.matchAll(/\[([^\]\n]+)\]\([^\n]*?\)/g))out.push(referenceTitle(m[1]));
  return [...new Set(out.filter(Boolean))].slice(0,12);
 }
 async function loadSources(){
  if(!sourcesPromise)sourcesPromise=(async()=>{
   const controller=new AbortController();let timeout;
   try{
    const request=fetch('./source-index.json',{cache:'no-cache',signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();});
    const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort('sources-timeout');reject(Error('sources-timeout'));},12000);});
    const j=await Promise.race([request,deadline]);
    if(!Array.isArray(j.sources)||j.sources.some(x=>!x||typeof x.title!=='string'||typeof x.content!=='string'))throw Error();
    return j.sources;
   }finally{clearTimeout(timeout);}
  })().catch(error=>{sourcesPromise=null;throw error;});return sourcesPromise;
 }
 function sourceLink(src){const official=safeURL(src.url);if(official)return {url:official,label:'查看来源 ↗'};if(typeof src.sha256==='string'&&/^[a-f0-9]{64}$/i.test(src.sha256))return {url:'./source.html?id='+src.sha256.toLowerCase(),label:'查看资料摘录 ↗'};return null;}
 function matchSources(index,name){return index.filter(x=>x.title===name||x.runtime_title===name);}
 function foldExcerptText(value){return text(value).toLowerCase().replace(/([\p{Script=Han}])\s+([a-z0-9])/gu,'$1$2').replace(/([a-z]{2,})\s+(\d+)/g,'$1$2');}
 function mixedExcerptTerm(term){return /[\p{Script=Han}]/u.test(term)&&/[a-z0-9]/.test(term)||/[a-z]/.test(term)&&/\d/.test(term);}
 function excerptTermMatches(value,term){if(!mixedExcerptTerm(term))return value.includes(term);let at=value.indexOf(term);while(at>=0){const before=value[at-1]||'',after=value[at+term.length]||'';if(!/[a-z0-9]/.test(after)&&(!/^[a-z0-9]/.test(term)||!/[a-z0-9]/.test(before)))return true;at=value.indexOf(term,at+1);}return false;}
 function excerptTerms(value){
  const clean=foldExcerptText(text(value).replace(/^\s*(?:\*\*)?依据[：:].*$/gm,'').replace(/《[^》]+》/g,''));
  const stop=new Set(['什么','哪些','怎么','如何','是否','请问','可以','今年','去年','情况','浙江','大学','招生','依据','资料','专业']);const out=new Set();
  for(const match of clean.matchAll(/([\p{Script=Han}]{2,})([a-z]{1,5}\d*)(?![a-z0-9])/gu))out.add(match[1].slice(-2)+match[2]);
  for(const run of clean.match(/[\p{Script=Han}]+|[a-z0-9][a-z0-9._-]*/gu)||[]){if(/^[a-z0-9]/.test(run)){if(run.length>1&&!/^(?:19|20)\d{2}$/.test(run))out.add(run);continue;}for(let n=2;n<=3;n++)for(let i=0;i<=run.length-n;i++){const t=run.slice(i,i+n);if(!stop.has(t))out.add(t);}}
  return [...out].slice(0,500);
 }
 function relevantExcerpt(src,answer,question=''){
  const questionTerms=excerptTerms(question),answerTerms=excerptTerms(answer);
  const candidates=(src.content.match(/[^。！？!?\r\n]+(?:[。！？!?]+[”’」』）)]*)?/gu)||[]).map(x=>x.trim()).filter(x=>x.length>=6&&!/^#|^(?:所属院系|资料用途|来源[：:]|专业名称[：:]|专业导游[：:]|Q\d+[：:])/i.test(x)&&x!==src.title&&x!==src.runtime_title);
  let best='',score=0,exactCount=-1;const exactQuestion=questionTerms.filter(mixedExcerptTerm);
  for(const sentence of candidates){const lower=foldExcerptText(sentence);const q=questionTerms.filter(t=>excerptTermMatches(lower,t)),a=answerTerms.filter(t=>excerptTermMatches(lower,t));const exact=exactQuestion.filter(t=>excerptTermMatches(lower,t)).length;let value=q.reduce((sum,t)=>sum+t.length*3,0)+a.reduce((sum,t)=>sum+t.length,0);if(!value)continue;value/=Math.sqrt(Math.max(40,sentence.length)/40);if(exact>exactCount||exact===exactCount&&value>score){exactCount=exact;score=value;best=sentence;}}
  if(best.length<=320)return best;
  const lower=best.toLowerCase(),terms=[...questionTerms,...answerTerms];const at=terms.map(t=>lower.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0]||0;const start=Math.max(0,Math.min(at-70,best.length-320));return (start?'…':'')+best.slice(start,start+320)+(start+320<best.length?'…':'');
 }
 function sourceDetails(message,question='',references=[]){
  const names=titles(message);if(!names.length)return null;
  const d=element('details','sources');d.append(element('summary','',`查看依据 · ${names.length} 项`));const content=element('div');d.append(content);let loaded=false,loading=false;
  async function populate(){
   if(leaving||loaded||loading)return;loading=true;content.replaceChildren(element('p','source-meta','正在加载来源…'));let index;
   try{index=await loadSources();}catch{if(leaving)return;const row=element('div','source-load-error');row.append(element('span','','来源加载失败。'));const retry=element('button','','重试');retry.type='button';retry.onclick=populate;row.append(retry);content.replaceChildren(row);loading=false;return;}
   if(leaving)return;content.replaceChildren();
   for(const name of names){
    const variants=matchSources(index,name);
    for(const src of variants.length?variants:[null]){
     const card=element('div','source-item');card.append(element('p','source-title',src?.runtime_title||name));
     if(src){
      const meta=element('p','source-meta');const labels=[src.year?src.year+'年资料':'',variants.length>1?src.college:''].filter(Boolean);if(labels.length)meta.append(document.createTextNode(labels.join(' · ')+' · '));
      const link=sourceLink(src);if(link){const a=element('a','',link.label);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';meta.append(a);}else meta.append(document.createTextNode('暂未提供可核验链接'));card.append(meta);
      const quote=relevantExcerpt(src,message.content,question);card.append(element('p','source-excerpt',quote?'资料摘录：“'+quote+'”':'尚未定位到与本次问题直接相关的摘句。'));
     }else card.append(element('p','source-meta','未找到对应资料，请核对引用名称。'));
     content.append(card);
    }
   }
   for(const ref of references){const matches=matchSources(index,ref.name);const link=matches.length===1?sourceLink(matches[0]):null;if(link){ref.url=link.url;ref.node.href=link.url;ref.node.target='_blank';ref.node.rel='noopener noreferrer';}}
   loaded=true;loading=false;
  }
  for(const ref of references)ref.node.onclick=e=>{if(ref.url)return;e?.preventDefault();d.open=true;void populate();};
  d.addEventListener('toggle',()=>{if(d.open)return populate();});if(references.length)void populate();return d;
 }
 function renderMessage(message,index=0){const item=element('article','message '+message.role);if(message.role==='user'){const bubble=element('div','user-text');bubble.append(element('div','',message.content));if(message.status==='failed'||(message.status==='pending'&&!busy)){const state=element('div','message-state',message.status==='failed'?'未收到完整答复':'答复尚未完成');if(active()?.messages.at(-1)===message){const retry=element('button','message-retry','重试');retry.type='button';retry.onclick=()=>{if(busy||leaving)return;return send(undefined,message);};state.append(retry);}bubble.append(state);}item.append(bubble);return item;}const label=element('div','assistant-label');label.append(icon('lamp-gold'),document.createTextNode('招小办'));const references=[];item.append(label,markdown(message.content,references,titles(message)));const question=active()?.messages.slice(0,index).filter(x=>x.role==='user').at(-1)?.content||'';const source=sourceDetails(message,question,references);if(source)item.append(source);const actions=element('div','message-actions');if(message.reasked)actions.append(element('span','message-note','已按你的原问题重新查询'));if(message.intake_notice)actions.append(element('span','message-note','平台首轮仍返回信息登记卡'));const cp=element('button');cp.append(icon('copy'),document.createTextNode('复制'));cp.setAttribute('aria-label','复制这条答复');cp.onclick=()=>copy(message.content);actions.append(cp);if(message.elapsed_seconds!==null&&Number.isFinite(message.elapsed_seconds))actions.append(element('span','',message.elapsed_seconds.toFixed(1)+' 秒'));item.append(actions);return item;}
 function render(){if(leaving)return;renderHistory();const messages=active()?.messages||[];$('welcome').hidden=messages.length>0;$('messages').replaceChildren(...messages.map(renderMessage));updateControls();updateChip();resize();requestAnimationFrame(()=>{const area=$('scroll-area');if(area)area.scrollTop=messages.length?area.scrollHeight:0;});}
 function resize(){const box=$('question');box.style.height='auto';box.style.height=Math.min(box.scrollHeight,150)+'px';}
 async function connect(){if(busy||leaving)return;$('status').textContent='正在连接';$('retry').disabled=true;const result=await window.ZJUTransport.check();if(leaving)return;ready=!!result.ready;$('status').textContent=ready?'已连接':'校园网未连接';$('status-dot').classList.toggle('ready',ready);$('retry').disabled=false;if(!ready){$('error').textContent=result.message||'请连接校园网或学校 VPN 后重试。';$('error').hidden=false;}else $('error').hidden=true;updateControls();}
 function looksLikeIntake(answer){const value=text(answer);return /请先告诉我[\s\S]{0,40}省份/.test(value)&&/想了解的招生类型/.test(value);}
 async function send(event,retryMessage=null){event?.preventDefault();const query=(retryMessage?.content||$('question').value).trim();if(leaving||busy||!query||!ready)return;if(query.length>2000){toast('问题最多2000字');return;}if(/\b(?:sk-[A-Za-z0-9_.-]{18,}|pk_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9_.-]{20,})/i.test(query)){$('error').textContent='请移除密钥或登录凭据后再发送。';$('error').hidden=false;return;}
 let chat=active();if(!chat){chat={local_id:uid(),conversation_id:'',last_message_id:'',draft:'',title:query.slice(0,32),updated_at:Date.now(),messages:[]};chats.unshift(chat);chats=chats.slice(0,maxChats);activeId=chat.local_id;newDraft='';}
 const preservedDraft=retryMessage&&$('question').value.trim()!==query?$('question').value:'';chat.draft=preservedDraft;
 const wire=retryMessage?.wire||(P?P.composeQuery(profile,query):query);
 let userMessage=chat.messages.at(-1);if(!(userMessage?.role==='user'&&['failed','pending'].includes(userMessage.status)&&userMessage.content===query)){userMessage={role:'user',content:query,wire,local_message_id:uid(),created_at:Date.now(),citations:[]};chat.messages.push(userMessage);}userMessage.status='pending';userMessage.wire=userMessage.wire||wire;userMessage.updated_at=Date.now();chat.messages=chat.messages.slice(-maxMessages);chat.updated_at=Date.now();busy=true;updateControls();$('question').value='';$('error').hidden=true;busy=true;aborter=new AbortController();render();const pending=element('div','pending');pending.append(element('span','pulse'));const elapsed=element('span','','正在深度思考中');pending.append(elapsed);$('messages').append(pending);$('scroll-area').scrollTop=$('scroll-area').scrollHeight;const start=performance.now();const timer=setInterval(()=>{elapsed.textContent=`${elapsed.dataset?.phase==='reask'?'正在按你的原问题重新查询':'正在深度思考中'} · 已等待 ${Math.floor((performance.now()-start)/1000)} 秒`;},1000);const totalTimeout=setTimeout(()=>aborter?.abort('timeout'),125000);
 const requestArgs={conversation_id:chat.conversation_id,parent_message_id:chat.last_message_id||'',signal:aborter.signal};
 let reasked=false,intakeNotice=false;
 try{
  let response=await window.ZJUTransport.send({query:userMessage.wire,...requestArgs});if(leaving)return;
  const firstAssistant=!chat.messages.some(m=>m.role==='assistant');
  if(INTAKE_REASK&&firstAssistant&&query.length>=6&&looksLikeIntake(response.answer)&&response.conversation_id&&response.message_id){
   reasked=true;intakeReasks++;elapsed.dataset.phase='reask';elapsed.textContent='正在按你的原问题重新查询…';
   try{
    const second=await window.ZJUTransport.send({query:userMessage.wire,conversation_id:response.conversation_id,parent_message_id:response.message_id,signal:aborter.signal});
    if(leaving)return;
    if(typeof second.answer==='string'&&second.answer.trim())response=second;
    intakeNotice=looksLikeIntake(response.answer);
   }catch(error){if(leaving)return;intakeNotice=true;}
  }
  if(typeof response.answer!=='string'||!response.answer.trim())throw Error('empty');chat.conversation_id=response.conversation_id;chat.last_message_id=response.message_id;userMessage.status='sent';userMessage.updated_at=Date.now();chat.messages.push({role:'assistant',content:response.answer,local_message_id:uid(),created_at:Date.now(),message_id:response.message_id,citations:response.citations||[],elapsed_seconds:Math.round((performance.now()-start)/100)/10,reasked,intake_notice:intakeNotice});chat.messages=chat.messages.slice(-maxMessages);chat.updated_at=Date.now();
 }catch(error){if(leaving)return;userMessage.status='failed';userMessage.updated_at=Date.now();chat.updated_at=Date.now();const stopped=aborter.signal.aborted;$('error').textContent=stopped?(aborter.signal.reason==='timeout'?'等待超时，请稍后手动重试。':'已停止等待；服务端可能仍在处理。'):error.public?error.message:'本次未收到完整答复，请手动重试。';$('error').hidden=false;chat.draft=preservedDraft||query;$('question').value=chat.draft;}
 finally{clearInterval(timer);clearTimeout(totalTimeout);busy=false;aborter=null;if(!leaving){chats.sort((a,b)=>b.updated_at-a.updated_at);$('question').value=chat.draft;render();$('question').focus();}}
 }
 function closeDrawer(){document.body.classList.remove('drawer-open');$('backdrop').hidden=true;$('sidebar').inert=window.innerWidth<=800;$('toggle-sidebar').setAttribute('aria-expanded',String(window.innerWidth>800&&!document.body.classList.contains('sidebar-hidden')));}

 /* ===== 来访者画像 ===== */
 function persistProfile(draft){const saved=P.save(draft);profile=saved.ok?saved.profile:P.sanitize(draft);profileStored=saved.ok;updatePill();updateChip();return saved.ok;}
 function chipButton(value,pressed,onClick,className=''){const b=element('button','chip'+(className?' '+className:''));b.type='button';b.setAttribute('aria-pressed',pressed?'true':'false');b.append(element('span','chip-dot'),document.createTextNode(value));b.onclick=onClick;return b;}
 function buildProfileForm(container,{context='welcome'}={}){
  if(!P||!container)return;
  container.replaceChildren();
  const draft={...profile,types:[...profile.types],targets:[...profile.targets],bonus:[...profile.bonus]};
  const head=element('div','profile-head');
  const headIcon=element('div','profile-head-icon');headIcon.append(icon('lamp-gold'));
  const headText=element('div','profile-head-text');headText.append(element('h3','',context==='dialog'?'补充来访者画像':'来访者画像'),element('p','','像接电话一样，先记下你是谁、从哪来、关心什么。'));
  head.append(headIcon,headText,element('span','profile-badge','约 1 分钟'));
  const progress=element('div','profile-progress');const progressText=element('span');const track=element('div','profile-progress-track');const bar=element('div','profile-progress-bar');track.append(bar);progress.append(progressText,track);
  const primaryGroups=element('div');
  const more=element('details','profile-more');const moreSummary=element('summary','','补充更多（选填）：阶段 · 意向专业 · 创新班 · 转专业 · 备注');const moreBody=element('div','profile-more-body');more.append(moreSummary,moreBody);
  const foot=element('div','profile-foot');
  const switchButton=element('button','switch');switchButton.type='button';switchButton.setAttribute('role','switch');const switchText=element('span','',profile.carry===false?'提问时不带画像':'每次提问自动带上');switchButton.append(element('span','switch-track'),switchText);
  const actions=element('div','profile-actions');const ghost=element('button','btn-ghost','');ghost.type='button';const done=element('button','btn-primary','完成');done.type='button';actions.append(ghost,done);foot.append(switchButton,actions);

  function groupBlock({key,label,hint,options,multiple=false,max=0,sub=false,gate=null}){
   const wrap=element('div','profile-group');const gh=element('div','profile-group-head');const state=element('span','profile-group-state',multiple?(max?'可多选 · 最多 '+max+' 项':'可多选'):'单选');gh.append(element('span','profile-group-label',label),state);
   const chips=element('div','chips');
   wrap.append(gh,element('p','profile-group-hint',hint),chips);
   const buttons=[];
   for(const value of options){
    const pressed=multiple?draft[key].includes(value):draft[key]===value;
    const b=chipButton(value,pressed,()=>{
     let changed=true;
     if(multiple){
      const list=draft[key];const at=list.indexOf(value);
      if(at>=0)list.splice(at,1);else{if(list.length>=max){toast('最多选 '+max+' 项');return;}list.push(value);}
     }else{draft[key]=draft[key]===value?'':value;}
     if(key==='targets'&&!draft.targets.includes('创新班（2026）'))draft.bonus=[];
     if(!changed)return;
     for(const item of buttons)item.node.setAttribute('aria-pressed',multiple?draft[key].includes(item.value):draft[key]===item.value?'true':'false');
     if(key==='targets'){const openNow=draft.targets.includes('创新班（2026）');bonusGroup.hidden=!openNow;}
     if(multiple)state.textContent=max?'可多选 · 已选 '+draft[key].length+'/'+max:'可多选';
     persistProfile(draft);refreshProgress();
    },sub?'sub':'');
    buttons.push({value,node:b});chips.append(b);
   }
   return wrap;
  }

  primaryGroups.append(groupBlock({key:'role',label:'我是谁',hint:'决定答复称呼与解释深度',options:P.GROUPS[0].options}));
  primaryGroups.append(groupBlock({key:'region',label:'招生地区',hint:'港澳台与国际学生的招生口径不同，请先选准',options:P.GROUPS[1].options}));
  const typesBlock=groupBlock({key:'types',label:'招生类型',hint:'不确定就选“还没确定”',options:P.GROUPS[2].options,multiple:true,max:P.MAX_TYPES});
  primaryGroups.append(typesBlock);

  const stageBlock=groupBlock({key:'stage',label:'当前阶段',hint:'用年级代替年龄，不收集生日',options:P.MORE_GROUPS[0].options,sub:true});
  const targetsBlock=groupBlock({key:'targets',label:'意向专业 / 学院',hint:'可选 3 项；创新班是 2026 年出现的班型，仅作意向标签',options:P.TARGET_OPTIONS,multiple:true,max:P.MAX_TARGETS,sub:true});
  const bonusGroup=groupBlock({key:'bonus',label:'具体创新班',hint:'最多 2 项；这些班型当年是否招生以正式简章为准',options:P.BONUS_OPTIONS,multiple:true,max:P.MAX_BONUS,sub:true});
  bonusGroup.hidden=!draft.targets.includes('创新班（2026）');
  const transferBlock=groupBlock({key:'transfer',label:'转专业意向',hint:'只用于解释公开的转专业规则',options:P.TRANSFER_OPTIONS,sub:true});
  const notesWrap=element('div','profile-group');notesWrap.append(element('div','profile-group-head'),element('span','profile-group-label','补充说明（选填）'));
  const notes=element('textarea','profile-notes');notes.value=draft.notes;notes.maxLength=P.MAX_NOTES;notes.placeholder='例如：孩子高二、数学竞赛省一、只考虑本省招生；不要填写身份证号、手机号等个人信息。';notes.setAttribute('aria-label','补充说明，选填');
  notes.oninput=()=>{draft.notes=text(notes.value,P.MAX_NOTES);};
  notes.onblur=()=>persistProfile(draft);
  notesWrap.append(notes);
  moreBody.append(stageBlock,targetsBlock,bonusGroup,transferBlock,notesWrap);
  if(draft.stage||draft.targets.length||draft.bonus.length||draft.transfer||draft.notes)more.open=true;

  function refreshProgress(){const filled=P.filledGroups(draft);progressText.textContent='已记录 '+filled.done+'/'+filled.total;bar.style.width=(filled.done/filled.total*100)+'%';ghost.textContent=profileEmpty()?'跳过':'清除';}
  switchButton.onclick=()=>{draft.carry=draft.carry===false;switchButton.setAttribute('aria-checked',draft.carry?'true':'false');switchText.textContent=draft.carry?'每次提问自动带上':'提问时不带画像';persistProfile(draft);};
  switchButton.setAttribute('aria-checked',draft.carry===false?'false':'true');
  ghost.onclick=()=>{if(P.isEmpty(draft)){draft.skipped=true;persistProfile(draft);renderProfile();toast('已跳过，随时可在右上角补充画像');}else{P.clear();profile=P.blank();profileStored=false;renderProfile();toast('画像已清除');}};
  done.onclick=()=>{draft.skipped=false;const ok=persistProfile(draft);renderProfile();if(context==='dialog')$('profile-dialog').close();toast(ok?'画像已记住，下次打开会自动带上':'浏览器未允许保存，本次页面内仍然有效');$('question').focus();};
  container.append(head,progress,primaryGroups,more,foot);
  refreshProgress();
 }
 function renderSavedProfile(container){
  container.replaceChildren();
  const head=element('div','profile-head');const headIcon=element('div','profile-head-icon');headIcon.append(icon('lamp-gold'));
  const headText=element('div','profile-head-text');headText.append(element('h3','','来访者画像'),element('p','','已记住，之后每次打开会自动带上，可随时修改。'));
  head.append(headIcon,headText,element('span','profile-badge','已保存'));
  const body=element('div','profile-saved');const chips=element('div','profile-saved-chips');
  for(const part of profileParts())chips.append(element('span','saved-chip',part));
  if(profile.types.length===0&&profile.targets.length===0)chips.append(element('span','saved-chip','未选招生类型'));
  const parts=P.detailParts(profile);const extra=parts.filter(x=>/^当前阶段|^意向创新班|^转专业|^补充说明/.test(x));
  const note=element('p','profile-saved-note',(profile.carry===false?'当前设置为提问时不携带画像。':'每次提问会自动带上；只保存在本机浏览器，不会保存对话内容。')+(extra.length?' '+extra.join('；')+'。':''));
  const actions=element('div','profile-saved-actions');const edit=element('button','btn-primary','修改画像');edit.type='button';edit.onclick=openProfileDialog;const clear=element('button','btn-ghost','清除');clear.type='button';clear.onclick=()=>{P.clear();profile=P.blank();profileStored=false;renderProfile();toast('画像已清除');};actions.append(edit,clear);
  body.append(chips,note,actions);container.append(head,body);
 }
 function renderCollapsedProfile(container){
  container.replaceChildren();
  const head=element('div','profile-head');const headIcon=element('div','profile-head-icon');headIcon.append(icon('lamp-gold'));
  const headText=element('div','profile-head-text');headText.append(element('h3','','来访者画像'),element('p','','可选：勾选身份与地区，答复会更贴近你的情况。'));
  head.append(headIcon,headText);
  const row=element('div','profile-collapsed');row.append(element('p','','你选择了跳过画像，招小办会按通用口径回答。'));const b=element('button','btn-primary','现在设置');b.type='button';b.onclick=()=>{profile.skipped=false;persistProfile(profile);renderProfile();};row.append(b);
  container.append(head,row);
 }
 function renderProfile(){if(leaving||!P)return;const card=$('profile-card');if(!card)return;if(profileEmpty()&&profile&&profile.skipped)renderCollapsedProfile(card);else if(profileEmpty())buildProfileForm(card,{context:'welcome'});else renderSavedProfile(card);if($('profile-dialog').open)buildProfileForm($('profile-dialog-body'),{context:'dialog'});updatePill();updateChip();}
 function openProfileDialog(){if(leaving||!P)return;$('profile-dialog-body').replaceChildren();buildProfileForm($('profile-dialog-body'),{context:'dialog'});$('profile-dialog').showModal();$('profile-dialog-close').focus();}

 $('toggle-sidebar').onclick=()=>{if(window.innerWidth<=800){const open=!document.body.classList.contains('drawer-open');document.body.classList.toggle('drawer-open',open);$('backdrop').hidden=!open;$('sidebar').inert=!open;$('toggle-sidebar').setAttribute('aria-expanded',String(open));if(open)$('new-chat').focus();}else{document.body.classList.toggle('sidebar-hidden');$('toggle-sidebar').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')));}};
 $('close-sidebar').onclick=$('backdrop').onclick=closeDrawer;$('new-chat').onclick=newChat;$('composer').onsubmit=send;$('retry').onclick=connect;
 $('question').oninput=()=>{if(busy||leaving)return;saveDraft();resize();updateControls();};$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
 $('stop').onclick=()=>aborter?.abort('user');
 document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{if(busy||leaving)return;$('question').value=b.dataset.question;resize();updateControls();$('question').focus();});
 $('cancel-delete').onclick=()=>$('delete-dialog').close();$('confirm-delete').onclick=()=>{if(busy||leaving)return;saveDraft();chats=chats.filter(x=>x.local_id!==deleteId);if(activeId===deleteId){activeId=null;$('question').value=newDraft;$('error').hidden=true;}deleteId=null;$('delete-dialog').close();render();};
 $('export-chat').onclick=()=>{const c=active();if(!c)return;const output={title:c.title,exported_at:new Date().toISOString(),profile:profileEmpty()?null:{role:profile.role,region:profile.region,stage:profile.stage,types:profile.types,targets:profile.targets,bonus:profile.bonus,transfer:profile.transfer,notes:profile.notes},messages:c.messages.map(({role,content})=>({role,content}))};const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json;charset=utf-8'}));const a=element('a');a.href=url;a.download='招小办对话-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('profile-pill').onclick=openProfileDialog;$('profile-chip-edit').onclick=openProfileDialog;$('profile-dialog-close').onclick=()=>$('profile-dialog').close();
 $('profile-dialog').addEventListener('click',e=>{if(e.target===$('profile-dialog'))$('profile-dialog').close();});
 $('profile-dialog').addEventListener('close',()=>{if(!leaving)renderProfile();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('drawer-open')){closeDrawer();$('toggle-sidebar').focus();}if(e.key==='Tab'&&document.body.classList.contains('drawer-open')){const items=[...$('sidebar').querySelectorAll('button:not(:disabled)')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}}});
 function clearPageBeforeLeave(){
  leaving=true;aborter?.abort('pagehide');chats=[];activeId=null;deleteId=null;newDraft='';ready=false;
  $('messages').replaceChildren();$('history').replaceChildren();$('question').value='';$('question').defaultValue='';
  $('welcome').hidden=false;$('history-empty').hidden=false;$('error').textContent='';$('error').hidden=true;
  clearTimeout(toastTimer);$('toast').textContent='';$('toast').hidden=true;
  $('question').disabled=true;$('send').disabled=true;$('new-chat').disabled=true;$('export-chat').disabled=true;$('stop').hidden=true;
  if($('delete-dialog').open)$('delete-dialog').close();if($('profile-dialog').open)$('profile-dialog').close();closeDrawer();
 }
 window.addEventListener('pagehide',clearPageBeforeLeave);
 window.addEventListener('pageshow',event=>{if(event.persisted){clearPageBeforeLeave();window.location.reload();}});
 window.addEventListener('resize',()=>{closeDrawer();resize();});$('question').value='';renderProfile();render();closeDrawer();connect();
})();
