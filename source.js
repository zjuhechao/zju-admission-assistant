(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id') || '';
  let loading = false;
  function safeURL(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  }
  async function load() {
    if (loading) return;
    if (!/^[a-f0-9]{64}$/.test(id)) { $('title').textContent = '资料链接不完整'; $('status').textContent = '请从问答中的依据链接重新打开。'; return; }
    loading = true; $('retry').hidden = true; $('status').textContent = '正在加载…';
    try {
      const response = await fetch('./source-index.json', {cache:'no-cache', signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error('source unavailable');
      const index = await response.json();
      if (!Array.isArray(index.sources)) throw new Error('invalid source index');
      const matches = index.sources.filter(s => s && s.sha256 === id);
      if (matches.length !== 1 || typeof matches[0].content !== 'string' || typeof matches[0].title !== 'string') {
        $('title').textContent = '未找到这份资料'; $('status').textContent = '请回到问答，重新打开最新依据链接。'; return;
      }
      const source = matches[0];
      $('title').textContent = source.runtime_title || source.title;
      document.title = source.title + ' · 浙大招小办';
      $('meta').textContent = [source.year ? source.year + '年资料' : '公开专业资料', source.college, '本站公开资料副本'].filter(Boolean).join(' · ');
      $('origin').replaceChildren();
      const url = safeURL(source.url);
      if (url) { const a = document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='打开官方发布页面'; $('origin').append(a); }
      else $('origin').textContent = '依据已核验的公开资料整理；当前未收录可核验的官方原始网址。';
      $('content').textContent = source.content;
      $('status').textContent = source.source_kind === 'factual_summary_not_verbatim_article' ? '此资料为政策摘要，具体表述请核对官方链接。' : '';
    } catch { $('title').textContent = '资料暂时未加载'; $('status').textContent = '请检查网络后重试。'; $('retry').hidden = false; }
    finally { loading = false; }
  }
  $('retry').addEventListener('click', load);
  load();
})();
