"use strict";
(() => {
 const $=id=>document.getElementById(id);
 let chats=[], activeId=null, busy=false, ready=false, leaving=false, aborter=null, deleteId=null, toastTimer, sourcesPromise;
 // Conversations belong only to this open page; a reload starts empty.
 const maxChats=20, maxMessages=40;
 function uid(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
 function text(value,max=50000){return typeof value==='string'?value.slice(0,max):'';}
 function active(){return chats.find(x=>x.local_id===activeId);}
 function element(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
 function icon(name){const img=element('img');img.src='./'+name+'.svg';img.alt='';return img;}
 function toast(message){if(leaving)return;$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
 function newChat(){if(busy||leaving)return;activeId=null;$('question').value='';$('error').hidden=true;render();closeDrawer();$('question').focus();}
 function updateControls(){if(leaving)return;$('send').disabled=busy||!ready||!$('question').value.trim();$('question').disabled=busy;$('stop').hidden=!busy;$('send').hidden=busy;$('new-chat').disabled=busy;$('export-chat').disabled=!active()?.messages.length;$('input-state').textContent=busy?'正在等待最终答复':'校园网 / 学校 VPN';document.querySelectorAll('.history-open,.history-delete,[data-question]').forEach(b=>b.disabled=busy);document.querySelectorAll('.message-retry').forEach(b=>b.disabled=busy||!ready);}
 function renderHistory(){const list=$('history');list.replaceChildren();for(const c of chats){const row=element('div','history-row'+(c.local_id===activeId?' active':''));const open=element('button','history-open',c.title);open.title=c.title;open.setAttribute('aria-label','打开对话：'+c.title);if(c.local_id===activeId)open.setAttribute('aria-current','true');open.onclick=()=>{if(busy||leaving)return;activeId=c.local_id;$('error').hidden=true;render();closeDrawer();};const del=element('button','history-delete','×');del.setAttribute('aria-label','删除对话：'+c.title);del.onclick=()=>{if(busy||leaving)return;deleteId=c.local_id;$('delete-dialog').showModal();$('cancel-delete').focus();};row.append(open,del);list.append(row);}$('history-empty').hidden=chats.length>0;}
 function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function inline(parent,s){const re=/(\*\*([^*\n]+)\*\*)|(\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\))/g;let p=0;for(const m of s.matchAll(re)){parent.append(document.createTextNode(s.slice(p,m.index)));if(m[2])parent.append(element('strong','',m[2]));else{const url=safeURL(m[5]);if(url){const a=element('a','',m[4]);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}else parent.append(document.createTextNode(m[0]));}p=m.index+m[0].length;}parent.append(document.createTextNode(s.slice(p)));}
 function markdown(answer){const body=element('div','answer');let list=null,paragraph=null;for(const raw of answer.split('\n')){const line=raw.trimEnd();if(!line.trim()){list=null;paragraph=null;continue;}const ordered=line.match(/^\s*\d+[.、)]\s+(.+)/),unordered=line.match(/^\s*[-*]\s+(.+)/);if(ordered||unordered){const kind=ordered?'ol':'ul';if(!list||list.tagName.toLowerCase()!==kind){list=element(kind);body.append(list);}const li=element('li');inline(li,(ordered||unordered)[1]);list.append(li);paragraph=null;}else{list=null;if(!paragraph){paragraph=element('p');body.append(paragraph);}else paragraph.append(element('br'));inline(paragraph,line.replace(/^#{1,6}\s+/,''));}}return body;}
 async function copy(value){const input=element('textarea');input.className='sr-only';input.value=value;document.body.append(input);input.select();let ok=false;try{ok=document.execCommand('copy');}catch{}input.remove();if(!ok){try{await Promise.race([navigator.clipboard.writeText(value),new Promise((_,reject)=>setTimeout(reject,1200))]);ok=true;}catch{}}toast(ok?'已复制':'复制未成功，请手动选择文字。');}
 function titles(message){const out=(message.citations||[]).map(x=>x.title);const line=message.content.match(/^依据[：:]\s*(.+)$/m)?.[1]||'';for(const m of line.matchAll(/《([^》\n]+)》/g))out.push(m[1]);return [...new Set(out.filter(Boolean))].slice(0,12);}
 async function loadSources(){if(!sourcesPromise)sourcesPromise=fetch('./source-index.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(j=>{if(!Array.isArray(j.sources)||j.sources.some(x=>!x||typeof x.title!=='string'||typeof x.content!=='string'))throw Error();return j.sources;}).catch(error=>{sourcesPromise=null;throw error;});return sourcesPromise;}
 function sourceDetails(message){
  const names=titles(message);if(!names.length)return null;
  const d=element('details','sources');d.append(element('summary','',`查看依据 · ${names.length} 项`));const content=element('div');d.append(content);let loaded=false,loading=false;
  async function populate(){
   if(!d.open||loaded||loading)return;loading=true;content.replaceChildren(element('p','source-meta','正在加载来源…'));let index;
   try{index=await loadSources();}catch{const row=element('div','source-load-error');row.append(element('span','','来源加载失败。'));const retry=element('button','','重试');retry.type='button';retry.onclick=populate;row.append(retry);content.replaceChildren(row);loading=false;return;}
   content.replaceChildren();
   for(const name of names){
    const variants=index.filter(x=>x.title===name||x.runtime_title===name);
    for(const src of variants.length?variants:[null]){
     const card=element('div','source-item');card.append(element('p','',name));
     if(src){
      card.append(element('p','source-meta',src.year?`${src.year}年资料`:('公开专业资料'+(src.college?' · '+src.college:''))));
      if(variants.length>1)card.append(element('p','source-meta','同名资料，按学院分别列出'));
      if(src.url&&safeURL(src.url)){const a=element('a','','官方来源 ↗');a.href=safeURL(src.url);a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
      if(src.content){const original=element('details');original.append(element('summary','','查看来源原文'));original.append(element('pre','source-original',text(src.content,80000)));card.append(original);}
     }else card.append(element('p','source-meta','已保留答复引用的资料名称'));
     content.append(card);
    }
   }
   loaded=true;loading=false;
  }d.addEventListener('toggle',populate);return d;
 }
 function renderMessage(message){const item=element('article','message '+message.role);if(message.role==='user'){const bubble=element('div','user-text');bubble.append(element('div','',message.content));if(message.status==='failed'||(message.status==='pending'&&!busy)){const state=element('div','message-state',message.status==='failed'?'未收到完整答复':'答复尚未完成');if(active()?.messages.at(-1)===message){const retry=element('button','message-retry','重试');retry.type='button';retry.onclick=()=>{if(busy||leaving)return;$('question').value=message.content;resize();send();};state.append(retry);}bubble.append(state);}item.append(bubble);return item;}const label=element('div','assistant-label');label.append(icon('school'),document.createTextNode('招小办'));item.append(label,markdown(message.content));const source=sourceDetails(message);if(source)item.append(source);const actions=element('div','message-actions');const cp=element('button');cp.append(icon('copy'),document.createTextNode('复制'));cp.setAttribute('aria-label','复制这条答复');cp.onclick=()=>copy(message.content);actions.append(cp);if(message.elapsed_seconds!==null&&Number.isFinite(message.elapsed_seconds))actions.append(element('span','',message.elapsed_seconds.toFixed(1)+' 秒'));item.append(actions);return item;}
 function render(){if(leaving)return;renderHistory();const messages=active()?.messages||[];$('welcome').hidden=messages.length>0;$('messages').replaceChildren(...messages.map(renderMessage));updateControls();resize();requestAnimationFrame(()=>{$('scroll-area').scrollTop=$('scroll-area').scrollHeight;});}
 function resize(){const box=$('question');box.style.height='auto';box.style.height=Math.min(box.scrollHeight,150)+'px';}
 async function connect(){if(busy||leaving)return;$('status').textContent='正在连接';$('retry').disabled=true;const result=await window.ZJUTransport.check();if(leaving)return;ready=!!result.ready;$('status').textContent=ready?'已连接':'校园网未连接';$('status-dot').classList.toggle('ready',ready);$('retry').disabled=false;if(!ready){$('error').textContent=result.message||'请连接校园网或学校 VPN 后重试。';$('error').hidden=false;}else $('error').hidden=true;updateControls();}
 async function send(event){event?.preventDefault();const query=$('question').value.trim();if(leaving||busy||!query||!ready)return;if(query.length>2000){toast('问题最多2000字');return;}if(/\b(?:sk-[A-Za-z0-9_.-]{18,}|pk_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9_.-]{20,})/i.test(query)){$('error').textContent='请移除密钥或登录凭据后再发送。';$('error').hidden=false;return;}
 let chat=active();if(!chat){chat={local_id:uid(),conversation_id:'',title:query.slice(0,32),updated_at:Date.now(),messages:[]};chats.unshift(chat);chats=chats.slice(0,maxChats);activeId=chat.local_id;}
 let userMessage=chat.messages.at(-1);if(!(userMessage?.role==='user'&&['failed','pending'].includes(userMessage.status)&&userMessage.content===query)){userMessage={role:'user',content:query,local_message_id:uid(),created_at:Date.now(),citations:[]};chat.messages.push(userMessage);}userMessage.status='pending';userMessage.updated_at=Date.now();chat.messages=chat.messages.slice(-maxMessages);chat.updated_at=Date.now();busy=true;updateControls();$('question').value='';$('error').hidden=true;busy=true;aborter=new AbortController();render();const pending=element('div','pending');pending.append(element('span','pulse'));const elapsed=element('span','','正在查询');pending.append(elapsed);$('messages').append(pending);$('scroll-area').scrollTop=$('scroll-area').scrollHeight;const start=performance.now();const timer=setInterval(()=>{elapsed.textContent=`正在查询 · 已等待 ${Math.floor((performance.now()-start)/1000)} 秒`;},1000);const totalTimeout=setTimeout(()=>aborter?.abort('timeout'),100000);
 try{const response=await window.ZJUTransport.send({query,conversation_id:chat.conversation_id,parent_message_id:chat.messages.filter(x=>x.role==='assistant').at(-1)?.message_id||'',signal:aborter.signal});if(leaving)return;if(typeof response.answer!=='string'||!response.answer.trim())throw Error('empty');chat.conversation_id=response.conversation_id;userMessage.status='sent';userMessage.updated_at=Date.now();chat.messages.push({role:'assistant',content:response.answer,local_message_id:uid(),created_at:Date.now(),message_id:response.message_id,citations:response.citations||[],elapsed_seconds:response.elapsed_seconds});chat.messages=chat.messages.slice(-maxMessages);chat.updated_at=Date.now();}
 catch(error){if(leaving)return;userMessage.status='failed';userMessage.updated_at=Date.now();chat.updated_at=Date.now();const stopped=aborter.signal.aborted;$('error').textContent=stopped?(aborter.signal.reason==='timeout'?'等待超时，请稍后手动重试。':'已停止等待；服务端可能仍在处理。'):error.public?error.message:'本次未收到完整答复，请手动重试。';$('error').hidden=false;$('question').value=query;}
 finally{clearInterval(timer);clearTimeout(totalTimeout);busy=false;aborter=null;if(!leaving){chats.sort((a,b)=>b.updated_at-a.updated_at);render();$('question').focus();}}
 }
 function closeDrawer(){document.body.classList.remove('drawer-open');$('backdrop').hidden=true;$('sidebar').inert=window.innerWidth<=800;$('toggle-sidebar').setAttribute('aria-expanded',String(window.innerWidth>800&&!document.body.classList.contains('sidebar-hidden')));}
 $('toggle-sidebar').onclick=()=>{if(window.innerWidth<=800){const open=!document.body.classList.contains('drawer-open');document.body.classList.toggle('drawer-open',open);$('backdrop').hidden=!open;$('sidebar').inert=!open;$('toggle-sidebar').setAttribute('aria-expanded',String(open));if(open)$('new-chat').focus();}else{document.body.classList.toggle('sidebar-hidden');$('toggle-sidebar').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')));}};
 $('close-sidebar').onclick=$('backdrop').onclick=closeDrawer;$('new-chat').onclick=newChat;$('composer').onsubmit=send;$('retry').onclick=connect;
 $('question').oninput=()=>{resize();updateControls();};$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
 $('stop').onclick=()=>aborter?.abort('user');
 document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{if(busy||leaving)return;$('question').value=b.dataset.question;resize();updateControls();$('question').focus();});
 $('cancel-delete').onclick=()=>$('delete-dialog').close();$('confirm-delete').onclick=()=>{chats=chats.filter(x=>x.local_id!==deleteId);if(activeId===deleteId){activeId=null;$('question').value='';$('error').hidden=true;}deleteId=null;$('delete-dialog').close();render();};
 $('export-chat').onclick=()=>{const c=active();if(!c)return;const output={title:c.title,exported_at:new Date().toISOString(),messages:c.messages.map(({role,content})=>({role,content}))};const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json;charset=utf-8'}));const a=element('a');a.href=url;a.download='招小办对话-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('drawer-open')){closeDrawer();$('toggle-sidebar').focus();}if(e.key==='Tab'&&document.body.classList.contains('drawer-open')){const items=[...$('sidebar').querySelectorAll('button:not(:disabled)')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}}});
 function clearPageBeforeLeave(){
  leaving=true;aborter?.abort('pagehide');chats=[];activeId=null;deleteId=null;ready=false;
  $('messages').replaceChildren();$('history').replaceChildren();$('question').value='';$('question').defaultValue='';
  $('welcome').hidden=false;$('history-empty').hidden=false;$('error').textContent='';$('error').hidden=true;
  clearTimeout(toastTimer);$('toast').textContent='';$('toast').hidden=true;
  $('question').disabled=true;$('send').disabled=true;$('new-chat').disabled=true;$('export-chat').disabled=true;$('stop').hidden=true;
  if($('delete-dialog').open)$('delete-dialog').close();closeDrawer();
 }
 window.addEventListener('pagehide',clearPageBeforeLeave);
 window.addEventListener('pageshow',event=>{if(event.persisted){clearPageBeforeLeave();window.location.reload();}});
 window.addEventListener('resize',()=>{closeDrawer();resize();});$('question').value='';render();closeDrawer();connect();
})();
