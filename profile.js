"use strict";
/* 浙大招小办 · 画像引导卡与常用问题集
   画像仅存本页内存（与对话一致，刷新即清空，不写 localStorage）。
   画像通过首条消息的结构化前缀传给后端，用于分流与回答风格控制。 */
(() => {
  const $ = id => document.getElementById(id);
  const profile = { province: '', type: '', familiarity: '' };
  const PROVINCES = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','香港','澳门','台湾'];
  const TYPES = [
    { key: '普通本科', faq: ['普通本科'] },
    { key: '强基计划', faq: ['强基计划'] },
    { key: '三位一体', faq: ['三位一体'] },
    { key: '综合评价', faq: ['综合评价'] },
    { key: '外语保送生', faq: ['外语保送生'] },
    { key: '港澳台招生', faq: ['港澳台招生'] },
    { key: '艺术体育类', faq: ['运动训练', '美术学与艺术科技'] },
    { key: '国际合作项目', faq: ['国际合作项目'] },
    { key: '高校专项', faq: ['高校专项'] },
    { key: '其他', faq: [] }
  ];
  let faqData = null;

  function buildProvinceOptions() {
    const sel = $('profile-province');
    if (!sel) return;
    sel.replaceChildren(new Option('请选择省份', ''));
    for (const p of PROVINCES) sel.add(new Option(p, p));
    sel.onchange = () => { profile.province = sel.value; refreshReady(); };
  }

  function buildTypeButtons() {
    const wrap = $('profile-types');
    if (!wrap) return;
    wrap.replaceChildren();
    for (const t of TYPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.key;
      b.dataset.type = t.key;
      b.onclick = () => {
        profile.type = t.key;
        wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        refreshReady();
      };
      wrap.append(b);
    }
  }

  function buildFamiliarityButtons() {
    const wrap = $('profile-familiarity');
    if (!wrap) return;
    wrap.replaceChildren();
    const options = [
      { key: '了解', hint: '直接提问，答复简洁', value: '了解' },
      { key: '不了解', hint: '先看常见问题，再详细解答', value: '不了解' }
    ];
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.key;
      b.dataset.familiarity = o.value;
      b.onclick = () => {
        profile.familiarity = o.value;
        wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        refreshReady();
        if (o.value === '不了解') showFAQ(profile.type);
        else hideFAQ();
      };
      wrap.append(b);
    }
  }

  function refreshReady() {
    const ready = !!(profile.province && profile.type && profile.familiarity);
    const btn = $('profile-start');
    if (btn) {
      btn.disabled = !ready;
      btn.textContent = ready ? '开始咨询' : '请先完成以上选择';
    }
  }

  function getPrefix() {
    if (!profile.province && !profile.type && !profile.familiarity) return '';
    return '【画像】省份：' + (profile.province || '未填') + '；招生类型：' + (profile.type || '未填') + '；了解程度：' + (profile.familiarity || '未填') + '。';
  }

  async function loadFAQ() {
    if (faqData) return faqData;
    const r = await fetch('./faq.json');
    faqData = await r.json();
    return faqData;
  }

  function faqItem(q, a) {
    const item = document.createElement('div');
    item.className = 'faq-item';
    const qn = document.createElement('button');
    qn.type = 'button';
    qn.className = 'faq-q';
    qn.textContent = q;
    qn.title = '点击此问题直接提问';
    qn.onclick = () => {
      const input = $('question');
      if (input) { input.value = q; input.focus(); input.dispatchEvent(new Event('input')); }
    };
    const an = document.createElement('p');
    an.className = 'faq-a';
    an.textContent = a;
    item.append(qn, an);
    return item;
  }

  async function showFAQ(typeKey) {
    const panel = $('faq-panel');
    if (!panel) return;
    const data = await loadFAQ();
    panel.replaceChildren();
    const head = document.createElement('p');
    head.className = 'faq-head';
    head.textContent = '常见问题，点击即可直接提问';
    panel.append(head);
    // 通用咨询
    for (const x of data['通用咨询'] || []) panel.append(faqItem(x.q, x.a));
    // 对应类型专题
    const type = (TYPES.find(t => t.key === typeKey) || { faq: [] });
    for (const key of type.faq) {
      for (const x of (data['招生类型'] || {})[key] || []) panel.append(faqItem(x.q, x.a));
    }
    if (!type.faq.length) {
      for (const key of Object.keys(data['招生类型'] || {})) {
        for (const x of data['招生类型'][key] || []) panel.append(faqItem(x.q, x.a));
      }
    }
    panel.hidden = false;
  }

  function hideFAQ() { const p = $('faq-panel'); if (p) p.hidden = true; }

  function startChat() {
    const card = $('profile-card');
    if (card) card.hidden = true;
    if (profile.familiarity === '不了解') showFAQ(profile.type);
    const input = $('question');
    if (input) input.focus();
  }

  window.ZJUProfile = { getPrefix, getProfile: () => ({ ...profile }) };

  buildProvinceOptions();
  buildTypeButtons();
  buildFamiliarityButtons();
  const startBtn = $('profile-start');
  if (startBtn) startBtn.onclick = startChat;
  refreshReady();
})();
