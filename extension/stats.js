'use strict'
// CodeStats 聚合统计（纯 Node，无 vscode/http 依赖）
// 被两处共用：dashboard/server.js（浏览器版）与 extension.js（IDE 侧边栏 Webview）

const fs = require('fs')

// 读取并清洗 JSONL（跳过坏行）
function readRecords(dataFile) {
  if (!fs.existsSync(dataFile)) return []
  let text = ''
  try {
    text = fs.readFileSync(dataFile, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      if (r && typeof r.date === 'string' && Number.isFinite(Number(r.lines))) out.push(r)
    } catch { /* 跳过坏行 */ }
  }
  return out
}

// 本地日期字符串（避免 UTC 偏移导致跨天错位）
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 文件扩展名 → 语言
const EXT_LANG = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', java: 'Java', go: 'Go', rs: 'Rust',
  c: 'C', h: 'C/C++', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  cs: 'C#', rb: 'Ruby', php: 'PHP', swift: 'Swift',
  kt: 'Kotlin', kts: 'Kotlin', vue: 'Vue', svelte: 'Svelte',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS', less: 'CSS',
  json: 'JSON', md: 'Markdown', markdown: 'Markdown',
  yml: 'YAML', yaml: 'YAML', sql: 'SQL',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell',
  xml: 'XML', toml: 'TOML', txt: 'Text',
}
function langOf(filePath) {
  const base = String(filePath || '').split(/[\\/]/).pop() || ''
  const m = /\.([A-Za-z0-9]+)$/.exec(base)
  if (!m) return '其他'
  return EXT_LANG[m[1].toLowerCase()] || m[1]
}

// 年度统计（与 /api/stats 完全一致）
function buildStats(dataFile, now = new Date()) {
  const records = readRecords(dataFile)
  const year = now.getFullYear()
  const todayKey = localDate(now)
  const yearStartKey = `${year}-01-01`
  const yearStart = new Date(year, 0, 1)

  const byDate = new Map()
  const byIde = new Map()
  const languages = new Map()
  const hours = new Array(24).fill(0)
  let total = 0
  let activeDays = 0
  for (const r of records) {
    const n = Math.max(0, Number(r.lines) || 0)
    if (n === 0) continue
    if (r.date < yearStartKey || r.date > todayKey) continue
    total += n
    const ide = r.ide || 'unknown'
    if (!byDate.has(r.date)) {
      byDate.set(r.date, { total: 0, byIde: {} })
      activeDays++
    }
    const day = byDate.get(r.date)
    day.total += n
    day.byIde[ide] = (day.byIde[ide] || 0) + n
    byIde.set(ide, (byIde.get(ide) || 0) + n)
    const lang = langOf(r.file)
    languages.set(lang, (languages.get(lang) || 0) + n)
    const ts = Number(r.ts)
    if (Number.isFinite(ts) && ts > 0) hours[new Date(ts).getHours()] += n
  }

  const days = []
  const yearEnd = new Date(year, 11, 31)
  for (let d = new Date(yearStart); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const key = localDate(d)
    const day = byDate.get(key)
    days.push({ date: key, total: day ? day.total : 0, byIde: day ? day.byIde : {} })
  }

  const rollingStart = new Date(now)
  rollingStart.setDate(rollingStart.getDate() - 364)
  rollingStart.setHours(0, 0, 0, 0)
  const rolling = []
  for (let i = 0; i < 365; i++) {
    const d = new Date(rollingStart)
    d.setDate(d.getDate() + i)
    const key = localDate(d)
    const day = byDate.get(key)
    rolling.push({ date: key, total: day ? day.total : 0, byIde: day ? day.byIde : {} })
  }

  let streak = 0
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!((byDate.get(todayKey) || {}).total > 0)) cursor.setDate(cursor.getDate() - 1)
  while (cursor >= yearStart && (byDate.get(localDate(cursor)) || {}).total > 0) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const ides = [...byIde.entries()]
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines - a.lines)
  const languagesArr = [...languages.entries()]
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines - a.lines)

  return {
    today: (byDate.get(todayKey) || {}).total || 0,
    todayKey,
    total,
    streak,
    activeDays,
    ides,
    languages: languagesArr,
    hours,
    days,
    rolling,
    dataFile,
  }
}

// 单日明细（与 /api/day 完全一致）
function buildDay(dataFile, date) {
  const byIde = {}
  const fileMap = new Map()
  let total = 0
  for (const r of readRecords(dataFile)) {
    if (r.date !== date) continue
    const n = Math.max(0, Number(r.lines) || 0)
    if (n === 0) continue
    total += n
    const ide = r.ide || 'unknown'
    byIde[ide] = (byIde[ide] || 0) + n
    const file = r.file || '(未知文件)'
    fileMap.set(file, (fileMap.get(file) || 0) + n)
  }
  const files = [...fileMap.entries()]
    .map(([file, lines]) => ({ file, lines }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 15)
  return { date, total, byIde, files }
}

module.exports = { readRecords, localDate, langOf, EXT_LANG, buildStats, buildDay }
