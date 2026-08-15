'use strict'
// CodeStats 扩展的纯逻辑部分（不依赖 vscode，可在 Node 里单测）
// extension.js 通过 require('./lib.js') 使用这里的函数

// ── IDE 识别：VSCode 系 IDE 共用这一个扩展，靠 appName 区分 ──
function detectIde(rawName) {
  const name = String(rawName || '').toLowerCase()
  if (name.includes('trae')) return 'trae'
  if (name.includes('cursor')) return 'cursor'
  if (name.includes('windsurf')) return 'windsurf'
  if (name.includes('visual studio code')) return 'vscode'
  if (name.includes('vscode')) return 'vscode'
  if (name.includes('intellij')) return 'idea'
  if (name.includes('webstorm')) return 'webstorm'
  if (name.includes('pycharm')) return 'pycharm'
  if (name.includes('goland')) return 'goland'
  const slug = String(rawName || 'unknown').toLowerCase().replace(/\s+/g, '-').slice(0, 24)
  return slug || 'unknown'
}

// 统计一次编辑"插入的换行数"（回车、粘贴多行都算；单行内打字/删除不计）
function countAddedLines(text) {
  return (String(text).match(/\n/g) || []).length
}

// 本地日期字符串（避免 UTC 偏移导致跨天错位）
function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 生成一条落盘记录（与仪表盘 daily.jsonl 格式严格一致）
function buildRecord(date, ide, file, lines, ts) {
  return JSON.stringify({ date, ide, file, lines, ts })
}

module.exports = { detectIde, countAddedLines, localToday, buildRecord }
