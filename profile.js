"use strict";
// 招小办 · 来访者画像
// 只保存画像字段到本机浏览器（单键），不保存对话、草稿或访客标识。
// 画像只用于理解身份与招生口径，不作为事实依据，也不进入检索词。
(() => {
const VERSION = 1;
const KEY = 'zju_admission_profile_v1';
const MAX_NOTES = 240;
const MAX_TYPES = 4;
const MAX_TARGETS = 3;
const MAX_BONUS = 2;

// 选项来自《人工问答采集_1200题》的招生类型与学院分布；不新增学校未公开的项目。
const GROUPS = [
  {
    key: 'role', label: '我是谁', hint: '决定答复称呼与解释深度',
    options: ['考生本人', '家长', '中学老师', '其他亲友']
  },
  {
    key: 'region', label: '招生地区', hint: '港澳台与国际学生口径不同，必须区分',
    options: ['浙江', '上海', '广东', '江苏', '山东', '河南', '四川', '其他省份', '香港', '澳门', '台湾', '国际学生']
  },
  {
    key: 'types', label: '招生类型', hint: '可多选，最多 4 项；不确定就选“还没确定”',
    multiple: true, max: MAX_TYPES,
    options: ['普通本科（高考）', '强基计划', '三位一体', '综合评价', '外语类保送', '高校专项', '艺术类', '运动训练', '港澳台招生', '国际本科', '还没确定']
  }
];

const MORE_GROUPS = [
  {
    key: 'stage', label: '当前阶段', hint: '用年级代替年龄，不收集生日',
    options: ['高三', '高二', '高一', '初中及以下', '往届毕业', '其他阶段']
  }
];

// 2026 年招生问答中出现的创新班班型（仅作意向标签，不等于当年招生承诺）。
const BONUS_OPTIONS = [
  '脑机智能创新班', '智能制造与机器人创新班', '未来汽车创新班', '智能光电芯片及系统创新班',
  '智能与国际传播创新班', '经济学拔尖班', '会计学（智能财务创新班）', '农业工程（农业智能机器人创新班）',
  '医学试验班（未来健康创新班）', '基础医学（智慧创新班）', '工科试验班（EE类）创新班'
];

const TARGET_OPTIONS = [
  '竺可桢学院', '计算机科学与技术学院', '人工智能学院', '信息与电子工程学院', '医学院',
  '管理学院', '经济学院', '电气工程学院', '机械工程学院', '外国语学院', 'ZJU-UoE联合学院',
  '创新班（2026）', '还没确定'
];

const TRANSFER_OPTIONS = ['想转专业', '暂不考虑', '还在了解'];

const ALL = new Map();
for (const group of [...GROUPS, ...MORE_GROUPS]) {
  for (const value of group.options) ALL.set(value, true);
}
for (const value of [...TARGET_OPTIONS, ...TRANSFER_OPTIONS, ...BONUS_OPTIONS]) ALL.set(value, true);

function blank() {
  return {
    v: VERSION, role: '', region: '', stage: '', types: [], targets: [],
    transfer: '', bonus: [], notes: '', carry: true, skipped: false, updated_at: 0
  };
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanOne(value) {
  const text = cleanText(value, 40);
  return ALL.has(text) ? text : '';
}

function cleanList(value, allowedMax) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const one = cleanOne(item);
    if (one && !out.includes(one) && out.length < allowedMax) out.push(one);
  }
  return out;
}

function sanitize(raw) {
  const base = blank();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  base.role = cleanOne(raw.role);
  base.region = cleanOne(raw.region);
  base.stage = cleanOne(raw.stage);
  base.types = cleanList(raw.types, MAX_TYPES);
  base.targets = cleanList(raw.targets, MAX_TARGETS);
  base.transfer = cleanOne(raw.transfer);
  base.bonus = cleanList(raw.bonus, MAX_BONUS);
  base.notes = cleanText(raw.notes, MAX_NOTES);
  base.carry = raw.carry !== false;
  base.skipped = raw.skipped === true;
  base.updated_at = Number.isFinite(raw.updated_at) ? Math.max(0, Math.floor(raw.updated_at)) : 0;
  return base;
}

function storage() {
  try {
    const store = window.localStorage;
    return store && typeof store.getItem === 'function' ? store : null;
  } catch { return null; }
}

function load() {
  const base = blank();
  const store = storage();
  if (!store) return { profile: base, stored: false, available: false };
  try {
    const text = store.getItem(KEY);
    if (typeof text !== 'string' || !text) return { profile: base, stored: false, available: true };
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== VERSION) return { profile: base, stored: false, available: true };
    return { profile: sanitize(parsed), stored: true, available: true };
  } catch {
    return { profile: base, stored: false, available: true };
  }
}

function save(profile) {
  const clean = sanitize(profile);
  clean.updated_at = Date.now();
  const store = storage();
  if (!store) return { ok: false, profile: clean };
  try {
    store.setItem(KEY, JSON.stringify(clean));
    return { ok: true, profile: clean };
  } catch {
    return { ok: false, profile: clean };
  }
}

function clear() {
  const store = storage();
  if (!store) return false;
  try { store.removeItem(KEY); return true; } catch { return false; }
}

function valuesOf(profile, key) {
  if (!profile) return [];
  const value = profile[key];
  if (Array.isArray(value)) return value.slice();
  return value ? [value] : [];
}

function filledGroups(profile) {
  const p = profile || blank();
  const total = 4;
  let done = 0;
  if (p.role) done++;
  if (p.region) done++;
  if (p.types.length) done++;
  if (p.targets.length) done++;
  return { done, total };
}

function isEmpty(profile) {
  const p = profile || blank();
  return !p.role && !p.region && !p.stage && !p.types.length && !p.targets.length && !p.transfer && !p.bonus.length && !p.notes;
}

function summary(profile) {
  const p = profile || blank();
  const parts = [];
  if (p.role) parts.push(p.role);
  if (p.region) parts.push(p.region);
  if (p.types.length) parts.push(p.types.join('、'));
  if (p.targets.length) parts.push(p.targets.join('、'));
  return parts;
}

function detailParts(profile) {
  const p = profile || blank();
  const parts = [];
  if (p.role) parts.push('身份：' + p.role);
  if (p.region) parts.push('招生地区：' + p.region);
  if (p.stage) parts.push('当前阶段：' + p.stage);
  if (p.types.length) parts.push('关注类型：' + p.types.join('、'));
  if (p.targets.length) parts.push('意向专业/学院：' + p.targets.join('、'));
  if (p.bonus.length) parts.push('意向创新班：' + p.bonus.join('、'));
  if (p.transfer) parts.push('转专业意向：' + p.transfer);
  if (p.notes) parts.push('补充说明：' + p.notes);
  return parts;
}

function queryPrefix(profile) {
  const parts = detailParts(profile);
  if (!parts.length) return '';
  return '【来访者画像｜只用于理解来电者身份与招生口径，不是事实依据，不要复述、不要写进检索词】'
    + parts.join('；') + '。';
}

function composeQuery(profile, question) {
  const q = typeof question === 'string' ? question.trim() : '';
  if (!q) return '';
  if (!profile || profile.carry === false) return q;
  const prefix = queryPrefix(profile);
  return prefix ? prefix + '\n\n问题：' + q : q;
}

function describe(profile, key) {
  const p = profile || blank();
  if (key === 'targets') return p.targets.length ? p.targets.join('、') : '';
  if (key === 'types') return p.types.length ? p.types.join('、') : '';
  return p[key] || '';
}

window.ZJUProfile = Object.freeze({
  VERSION, KEY, MAX_NOTES, MAX_TYPES, MAX_TARGETS, MAX_BONUS,
  GROUPS, MORE_GROUPS, TARGET_OPTIONS, TRANSFER_OPTIONS, BONUS_OPTIONS,
  blank, sanitize, load, save, clear, valuesOf, filledGroups, isEmpty, summary,
  detailParts, queryPrefix, composeQuery, describe
});
})();
