'use strict'
// CodeStats 数据模拟器：生成一年的样例数据，用于预览仪表盘
// 用法：
//   node tools/simulate.js                # 写入 ~/.codestats/daily.sample.jsonl（默认）
//   node tools/simulate.js --days 90      # 只生成 90 天
//   node tools/simulate.js --out D:/x.jsonl  # 指定输出文件
// 注意：样例数据写到 daily.sample.jsonl，不会污染真实数据 daily.jsonl。

const fs = require('fs')
const path = require('path')
const os = require('os')

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const days = Number(argValue('--days', 365))
const outFile = argValue('--out', path.join(os.homedir(), '.codestats', 'daily.sample.jsonl'))

// 伪随机（可复现）
let seed = 20260214
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function randInt(min, max) {
  return min + Math.floor(rand() * (max - min + 1))
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)]
}

const IDES = [
  { name: 'trae', weight: 0.42 },
  { name: 'vscode', weight: 0.33 },
  { name: 'idea', weight: 0.25 },
]
function pickIde() {
  const r = rand()
  let acc = 0
  for (const ide of IDES) {
    acc += ide.weight
    if (r <= acc) return ide.name
  }
  return 'trae'
}

const FILES = [
  'src/components/Header.tsx',
  'src/components/Footer.tsx',
  'src/pages/Home.tsx',
  'src/pages/About.tsx',
  'src/utils/format.ts',
  'src/api/client.ts',
  'src/store/session.ts',
  'src/styles/main.css',
  'server/index.ts',
  'server/routes.ts',
  'server/db.ts',
  'tests/app.test.ts',
  'docs/README.md',
]

const rows = []
const end = new Date()
end.setHours(0, 0, 0, 0)
for (let i = days - 1; i >= 0; i--) {
  const d = new Date(end)
  d.setDate(d.getDate() - i)
  const dow = d.getDay() // 0=Sun
  const isWeekend = dow === 0 || dow === 6
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // 工作日大概率活跃，周末约 25% 概率休息
  if (isWeekend && rand() < 0.6) continue

  const perDay = randInt(isWeekend ? 30 : 120, isWeekend ? 260 : 620)
  const edits = randInt(3, 9)
  for (let e = 0; e < edits; e++) {
    const ide = pickIde()
    const file = pick(FILES)
    const share = rand() * 0.5 + 0.15
    const lines = Math.max(1, Math.round(perDay * share / edits))
    // 活跃时段：上午 9-12 / 下午 14-18 / 晚上 20-22 分布
    const hh = rand() < 0.45 ? 9 + Math.floor(rand() * 4) : rand() < 0.8 ? 14 + Math.floor(rand() * 5) : 20 + Math.floor(rand() * 3)
    const mm = Math.floor(rand() * 60)
    const ts = Date.parse(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
    rows.push(JSON.stringify({ date, ide, file, lines, ts }))
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, rows.join('\n') + '\n')
console.log(`已生成 ${rows.length} 条样例记录（${days} 天）→ ${outFile}`)
console.log(`预览仪表盘：CODESTATS_FILE="${outFile}" node dashboard/server.js`)
