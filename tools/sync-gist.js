#!/usr/bin/env node
'use strict';

/**
 * 把本地 daily.jsonl 聚合成鸿蒙桌面卡片需要的紧凑数据，推到私有 GitHub Gist。
 *
 *   node tools/sync-gist.js            推送（读 ~/.codestats/sync.json 里的 token / gistId）
 *   node tools/sync-gist.js --dry      只生成本地 widget.json，不联网
 *   node tools/sync-gist.js --init     打印配置指引
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { langOf } = require('../extension/stats.js');

const DATA_FILE = process.env.CODESTATS_FILE || path.join(os.homedir(), '.codestats', 'daily.jsonl');
const CONFIG_FILE = path.join(os.homedir(), '.codestats', 'sync.json');
const LOCAL_OUT = path.join(os.homedir(), '.codestats', 'widget.json');

const GIST_FILENAME = 'codestats.json';
const WEEKS = 6;
const MAX_LANGS = 6;
const MAX_IDES = 5;

const IDE_NAMES = {
  vscode: 'VS Code',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  trae: 'Trae',
  idea: 'IntelliJ IDEA',
};

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** 一次遍历同时算：每日行数、当月语言、全年语言、全年 IDE */
function readDaily(file, monthPrefix, yearPrefix) {
  const byDate = {};
  const langs = {};
  const yearLangs = {};
  const ides = {};
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { byDate, langs, yearLangs, ides };
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const date = rec && rec.date;
    const lines = rec && rec.lines;
    if (typeof date !== 'string' || typeof lines !== 'number' || !isFinite(lines) || lines <= 0) continue;
    byDate[date] = (byDate[date] || 0) + lines;
    const lang = langOf(rec.file);
    if (monthPrefix && date.startsWith(monthPrefix)) {
      langs[lang] = (langs[lang] || 0) + lines;
    }
    if (yearPrefix && date.startsWith(yearPrefix)) {
      yearLangs[lang] = (yearLangs[lang] || 0) + lines;
      const ide = rec.ide || 'unknown';
      ides[ide] = (ides[ide] || 0) + lines;
    }
  }
  return { byDate, langs, yearLangs, ides };
}

/** 取前 max 个，剩下的合并成「其他」。返回给界面用的串 + 最大值（画条用） */
function packTop(map, max) {
  const list = Object.keys(map).map((k) => [k, map[k]]).sort((a, b) => b[1] - a[1]);
  let head = list;
  if (list.length > max) {
    head = list.slice(0, max - 1);
    const rest = list.slice(max - 1).reduce((s, it) => s + it[1], 0);
    const other = head.find((it) => it[0] === '其他');
    if (other) {
      other[1] += rest;
    } else {
      head.push(['其他', rest]);
    }
  }
  return {
    str: head.map((it) => it[0] + ':' + it[1]).join('|'),
    top: head.length > 0 ? head[0][1] : 0,
  };
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function ymd(y, m, d) {
  return y + '-' + pad(m) + '-' + pad(d);
}

/** 生成按日历顺序（周一到周日，逐行）排列的 6x7 网格：索引 = 星期偏移 + 日 - 1，-1 表示不在本月 */
function buildCells(byDate, now) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const today = now.getDate();
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstMonOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7;

  const cells = new Array(WEEKS * 7).fill(-1);
  for (let d = 1; d <= daysInMonth; d++) {
    const idx = firstMonOffset + d - 1;
    if (idx >= WEEKS * 7) continue;
    const v = byDate[ymd(y, m, d)] || 0;
    cells[idx] = v;
  }
  return { cells, today, daysInMonth, firstMonOffset };
}

/** 整年热力图：按周切列（周一为第 0 行），返回扁平的 周数*7 数组与 1 月 1 日的星期偏移 */
function buildYearCells(byDate, now) {
  const y = now.getFullYear();
  const offset = (new Date(y, 0, 1).getDay() + 6) % 7;
  const today = new Date(y, now.getMonth(), now.getDate());
  // 只铺到今天所在的这一周，避免右侧一整片空列
  const daysSoFar = Math.floor((today - new Date(y, 0, 1)) / 86400000) + 1;
  const weeks = Math.ceil((offset + daysSoFar) / 7);
  const cells = new Array(weeks * 7).fill(-1);
  for (let i = 0; i < daysSoFar; i++) {
    const d = new Date(y, 0, 1 + i);
    if (d > today) continue;
    const key = ymd(y, d.getMonth() + 1, d.getDate());
    cells[offset + i] = byDate[key] || 0;
  }
  return { cells, weeks, offset };
}

function buildPayload(byDate, langs, yearLangs, ides, now) {
  const { cells, daysInMonth } = buildCells(byDate, now);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  let month = 0;
  for (let d = 1; d <= daysInMonth; d++) month += byDate[ymd(y, m, d)] || 0;

  let year = 0;
  const prefix = String(y) + '-';
  for (const k of Object.keys(byDate)) {
    if (k.startsWith(prefix)) year += byDate[k];
  }

  let active = 0;
  for (const v of cells) if (v > 0) active++;
  const peak = cells.reduce((a, b) => (b > a ? b : a), 0);
  const packed = packTop(langs, MAX_LANGS);

  const yc = buildYearCells(byDate, now);
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const key = y + '-' + pad(i);
    let sum = 0;
    for (const k of Object.keys(byDate)) {
      if (k.startsWith(key)) sum += byDate[k];
    }
    months.push(sum);
  }

  let activeDays = 0;
  let longest = 0;
  let run = 0;
  let prev = null;
  const days = Object.keys(byDate).filter((k) => k.startsWith(prefix)).sort();
  for (const k of days) {
    activeDays++;
    if (prev && (new Date(k) - new Date(prev)) === 86400000) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = k;
  }

  const ideMap = {};
  for (const k of Object.keys(ides)) {
    ideMap[IDE_NAMES[k] || k] = ides[k];
  }
  const packedIde = packTop(ideMap, MAX_IDES);
  const packedYearLang = packTop(yearLangs, MAX_LANGS);

  return {
    v: 4,
    updated: now.toISOString(),
    month: y + '-' + pad(m),
    today: byDate[ymd(y, m, now.getDate())] || 0,
    monthTotal: month,
    yearTotal: year,
    activeDays: active,
    peak,
    cells: cells.join(','),
    langs: packed.str,
    langTop: packed.top,
    year: y,
    yearCells: yc.cells.join(','),
    yearWeeks: yc.weeks,
    yearOffset: yc.offset,
    yearPeak: yc.cells.reduce((a, b) => (b > a ? b : a), 0),
    months: months.join(','),
    yearLangs: packedYearLang.str,
    yearLangsTop: packedYearLang.top,
    ides: packedIde.str,
    idesTop: packedIde.top,
    yearActive: activeDays,
    yearAvg: activeDays > 0 ? Math.round(year / activeDays) : 0,
    streak: longest,
  };
}

async function gistRequest(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codestats-sync',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

async function main() {
  const argv = process.argv.slice(2);
  const cfg = readConfig();

  if (argv.includes('--init')) {
    console.log('1. GitHub → Settings → Developer settings → Personal access tokens → 生成 token（勾选 gist 权限）');
    console.log('2. 写入配置：');
    console.log('   ' + CONFIG_FILE);
    console.log('   { "token": "ghp_xxx", "gistId": "" }');
    console.log('3. node tools/sync-gist.js        首次运行会自动建一个私有 gist 并回填 gistId');
    return;
  }

  const now = new Date();
  const monthPrefix = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  const yearPrefix = String(now.getFullYear()) + '-';
  const { byDate, langs, yearLangs, ides } = readDaily(DATA_FILE, monthPrefix, yearPrefix);
  const payload = buildPayload(byDate, langs, yearLangs, ides, now);
  const content = JSON.stringify(payload, null, 2);

  fs.mkdirSync(path.dirname(LOCAL_OUT), { recursive: true });
  fs.writeFileSync(LOCAL_OUT, content);

  const dry = argv.includes('--dry') || !cfg.token;
  if (dry) {
    console.log('[dry] 已生成本地 ' + LOCAL_OUT + (cfg.token ? '' : '（未配置 token，仅本地预览）'));
    console.log(content);
    return;
  }

  const token = cfg.token;
  let gistId = cfg.gistId;
  const files = {};
  files[GIST_FILENAME] = { content };

  if (!gistId) {
    const created = await gistRequest('POST', 'https://api.github.com/gists', token, {
      description: 'CodeStats widget data',
      public: false,
      files,
    });
    gistId = created.id;
    cfg.gistId = gistId;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    console.log('已创建私有 gist：' + gistId);
  } else {
    await gistRequest('PATCH', 'https://api.github.com/gists/' + gistId, token, { files });
  }

  console.log('已同步 ' + payload.month + ' · 今日 ' + payload.today + ' 行 · 本月 ' + payload.monthTotal + ' 行 · 本年 ' + payload.yearTotal + ' 行');
  console.log('gistId = ' + gistId + '（填到 App 设置页）');
}

main().catch((e) => {
  console.error('同步失败：' + e.message);
  process.exit(1);
});
