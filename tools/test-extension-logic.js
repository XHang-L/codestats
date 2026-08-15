'use strict'
// CodeStats 扩展纯逻辑单测
// 用法: node tools/test-extension-logic.js
// 覆盖: IDE 识别 · 行数统计 · 日期格式 · 记录格式 · 全链路(编辑→聚合→落盘→仪表盘解析)

const fs = require('fs')
const os = require('os')
const path = require('path')
const lib = require('../extension/lib.js')

let failures = 0
const pass = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   — ' + detail : ''}`)
  if (!ok) failures++
}

// ── 1. IDE 识别 ──
const ideCases = [
  ['Trae', 'trae'],
  ['Trae AI IDE', 'trae'],
  ['Visual Studio Code', 'vscode'],
  ['Visual Studio Code - Insiders', 'vscode'],
  ['Cursor', 'cursor'],
  ['Windsurf', 'windsurf'],
  ['IntelliJ IDEA', 'idea'],
  ['WebStorm', 'webstorm'],
  ['PyCharm', 'pycharm'],
  ['GoLand', 'goland'],
  ['My Custom Editor', 'my-custom-editor'],
  ['', 'unknown'],
]
for (const [input, expect] of ideCases) {
  pass(`detectIde("${input}") = "${expect}"`, lib.detectIde(input) === expect, 'got=' + lib.detectIde(input))
}

// ── 2. 行数统计 ──
const lineCases = [
  ['', 0],
  ['abc', 0],
  ['a\n', 1],
  ['a\nb', 1],
  ['a\nb\n', 2],
  ['a\nb\nc\n', 3],
  ['\n\n\n', 3],
  ['多行\n中文\n文本\n', 3],
]
for (const [text, expect] of lineCases) {
  pass(`countAddedLines(${JSON.stringify(text)}) = ${expect}`, lib.countAddedLines(text) === expect, 'got=' + lib.countAddedLines(text))
}

// ── 3. 日期格式 ──
pass('localToday 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(lib.localToday()), lib.localToday())
const fixed = new Date(2026, 7, 5) // 2026-08-05 本地
pass('localToday 本地日期（非 UTC 偏移）', lib.localToday(fixed) === '2026-08-05', lib.localToday(fixed))

// ── 4. 记录格式 ──
const rec = JSON.parse(lib.buildRecord('2026-08-14', 'trae', 'src/a.ts', 42, 1786600000000))
pass('buildRecord 字段齐全', rec.date === '2026-08-14' && rec.ide === 'trae' && rec.file === 'src/a.ts' && rec.lines === 42 && typeof rec.ts === 'number')

// ── 5. 全链路：模拟扩展一天的编辑 → 聚合 → 落盘 → 用仪表盘的解析规则读回 ──
// （模拟 extension.js 的 bump/flush 行为，输出必须能被 dashboard/server.js 的 readRecords 消费）
function simulate() {
  const pending = new Map() // key: date\u0000ide\u0000file → lines
  const edits = [
    { ide: 'Trae', file: 'src/app.ts', text: 'import x from "y"\n\nconst a = 1\n' }, // 3 行
    { ide: 'Trae', file: 'src/app.ts', text: 'export default a\n' }, // 1 行
    { ide: 'Visual Studio Code', file: 'src/utils.ts', text: 'export const fmt = (n) => String(n)\n' }, // 1 行
    { ide: 'Visual Studio Code', file: 'src/utils.ts', text: '// comment\n' }, // 1 行
    { ide: 'Trae', file: 'docs/readme.md', text: '# Title\n\ntext\n' }, // 2 行
    { ide: 'Cursor', file: 'src/app.ts', text: 'const b = 2' }, // 0 行（单行打字）
    { ide: 'Trae', file: 'src/app.ts', text: '\n' }, // 1 行（空行）
  ]
  for (const e of edits) {
    const added = lib.countAddedLines(e.text)
    if (added === 0) continue
    const key = lib.localToday() + '\u0000' + lib.detectIde(e.ide) + '\u0000' + e.file
    pending.set(key, (pending.get(key) || 0) + added)
  }
  const rows = []
  for (const [key, lines] of pending) {
    const parts = key.split('\u0000')
    rows.push(lib.buildRecord(parts[0], parts[1], parts[2], lines, Date.now()))
  }
  return rows.join('\n') + '\n'
}

const tmpFile = path.join(os.tmpdir(), 'codestats-ext-' + Date.now() + '.jsonl')
fs.writeFileSync(tmpFile, simulate())

// 用仪表盘同款解析规则读回（readRecords 的逻辑）
const text = fs.readFileSync(tmpFile, 'utf8')
const records = []
for (const line of text.split('\n')) {
  if (!line.trim()) continue
  try {
    const r = JSON.parse(line)
    if (r && typeof r.date === 'string' && Number.isFinite(Number(r.lines))) records.push(r)
  } catch { /* 坏行 */ }
}
fs.unlinkSync(tmpFile)

pass('全链路：落盘记录可被仪表盘解析', records.length === 3, 'records=' + records.length + '（3 条聚合：app.ts/utils.ts/readme.md）')
const total = records.reduce((a, r) => a + r.lines, 0)
pass('全链路：总行数 = 10（3+1+1+3+1+1）', total === 10, 'total=' + total)
const appTs = records.find((r) => r.file === 'src/app.ts')
pass('全链路：app.ts 聚合为 5 行（3+1+1）', appTs && appTs.lines === 5 && appTs.ide === 'trae', appTs ? appTs.ide + ':' + appTs.lines : 'missing')
const readme = records.find((r) => r.file === 'docs/readme.md')
pass('全链路：readme.md 聚合为 3 行', readme && readme.lines === 3, readme ? String(readme.lines) : 'missing')
const singleLineEditExcluded = records.every((r) => !(r.file === 'src/app.ts' && r.ide === 'cursor'))
pass('全链路：单行打字(0换行)不产生记录', singleLineEditExcluded)
pass('全链路：ide 统一小写别名', records.every((r) => r.ide === 'trae' || r.ide === 'vscode'))
pass('全链路：日期为今天', records.every((r) => r.date === lib.localToday()))

console.log('')
console.log(failures === 0 ? '✅ 扩展逻辑测试全部通过' : `❌ ${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
