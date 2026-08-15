'use strict'
// CodeStats 仪表盘自动化测试
// 用法: node tools/test-dashboard.js [baseURL]   默认 http://127.0.0.1:4399
// 覆盖: /api/stats 一致性 · /api/day · 静态资源 · 空数据 · 脏数据容错

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const BASE = process.argv[2] || 'http://127.0.0.1:4399'
let failures = 0
const pass = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   — ' + detail : ''}`)
  if (!ok) failures++
}

async function get(url) {
  const res = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  return { status: res.status, json: () => { try { return JSON.parse(text) } catch { return null } }, text }
}
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s)

async function withServer(port, dataFile, fn) {
  const env = { ...process.env, CODESTATS_FILE: dataFile, PORT: String(port) }
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'dashboard', 'server.js')], { env, stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 1200))
  try { await fn(`http://127.0.0.1:${port}`) } finally { child.kill() }
}

async function main() {
  console.log('=== 1. /api/stats 一致性 ===')
  const r = await get(BASE + '/api/stats')
  pass('GET /api/stats -> 200', r.status === 200, 'status=' + r.status)
  const s = r.json()
  const keys = ['today', 'todayKey', 'total', 'streak', 'activeDays', 'ides', 'languages', 'hours', 'days', 'rolling', 'dataFile']
  pass('含全部字段', s !== null && keys.every((k) => k in s), s === null ? 'null' : Object.keys(s).join(','))
  if (!s) { console.log('FATAL: stats 为 null'); process.exit(1) }

  pass('days 为自然年 (365/366)', s.days.length === 365 || s.days.length === 366, 'count=' + s.days.length)
  pass('days 从 1月1日 开始', s.days[0].date.endsWith('-01-01'), s.days[0].date)
  pass('days 到 12月31日 结束', s.days[s.days.length - 1].date.endsWith('-12-31'), s.days[s.days.length - 1].date)
  pass('rolling 长度 365', s.rolling.length === 365, 'count=' + s.rolling.length)
  pass('所有日期格式合法', s.days.every((d) => isDate(d.date)) && s.rolling.every((d) => isDate(d.date)))
  pass('todayKey 格式合法', isDate(s.todayKey), s.todayKey)

  const sumIde = sum(s.ides.map((i) => i.lines))
  const sumLang = sum(s.languages.map((l) => l.lines))
  const sumHours = sum(s.hours)
  const sumRoll = sum(s.rolling.map((d) => d.total))
  const sumDays = sum(s.days.map((d) => d.total))
  pass('总行数 = IDE 之和', s.total === sumIde, `${s.total} vs ${sumIde}`)
  pass('总行数 = 语言之和', s.total === sumLang, `${s.total} vs ${sumLang}`)
  pass('总行数 = 时段之和', s.total === sumHours, `${s.total} vs ${sumHours}`)
  pass('总行数 = rolling 之和', s.total === sumRoll, `${s.total} vs ${sumRoll}`)
  pass('总行数 = 热力图之和', s.total === sumDays, `${s.total} vs ${sumDays}`)
  pass('今日行数合法', Number.isInteger(s.today) && s.today >= 0 && s.today <= s.total, 'today=' + s.today)
  pass('hours 长度 24', s.hours.length === 24 && s.hours.every((h) => h >= 0), 'len=' + s.hours.length)
  pass('活跃天数在 [0,365]', s.activeDays >= 0 && s.activeDays <= 365, 'active=' + s.activeDays)
  pass('连续天数非负', Number.isInteger(s.streak) && s.streak >= 0, 'streak=' + s.streak)
  pass('ides 按行数降序', s.ides.every((v, i) => i === 0 || s.ides[i - 1].lines >= v.lines))
  pass('languages 按行数降序', s.languages.every((v, i) => i === 0 || s.languages[i - 1].lines >= v.lines))

  console.log('')
  console.log('=== 2. /api/day 单日明细 ===')
  const withData = s.days.find((d) => d.total > 0)
  if (withData) {
    const d = await get(BASE + `/api/day?date=${withData.date}`)
    const dj = d.json()
    pass(`有数据日 ${withData.date} -> 200`, d.status === 200)
    pass('该日 total 与 stats 一致', dj !== null && dj.total === withData.total, `total=${dj && dj.total}`)
    pass('含 byIde + files 数组', dj !== null && dj.byIde && Array.isArray(dj.files))
    pass('byIde 之和 = 该日 total', dj !== null && sum(Object.values(dj.byIde)) === dj.total, '')
    pass('files 按行数降序且非空', dj !== null && dj.files.length > 0 && dj.files.every((f, i) => i === 0 || dj.files[i - 1].lines >= f.lines), 'files=' + (dj ? dj.files.length : 0))
  } else {
    console.log('SKIP  有数据日（样例里今年无数据？）')
  }
  const emptyDay = await get(BASE + '/api/day?date=2099-01-01')
  const ed = emptyDay.json()
  pass('未来日期 -> 200 且 0 行', emptyDay.status === 200 && ed && ed.total === 0 && ed.files.length === 0, '')
  const bad = await get(BASE + '/api/day?date=abc')
  pass('非法日期 -> 400', bad.status === 400, 'status=' + bad.status)
  const none = await get(BASE + '/api/day')
  pass('缺日期参数 -> 400', none.status === 400, 'status=' + none.status)

  console.log('')
  console.log('=== 3. 静态资源 ===')
  for (const f of ['/', '/app.js', '/style.css']) {
    const rr = await get(BASE + f)
    pass(`GET ${f} -> 200`, rr.status === 200, 'status=' + rr.status)
  }
  const idx = (await get(BASE + '/')).text
  pass('index 引用 app.js + style.css', idx.includes('app.js') && idx.includes('style.css'))
  pass('index 含新面板容器', ['week-banner', 'day-detail', 'lang-breakdown', 'hours-chart', 'range-seg'].every((id) => idx.includes(id)))

  console.log('')
  console.log('=== 4. 空数据文件（独立服务器 :4400） ===')
  const emptyFile = path.join(os.tmpdir(), 'codestats-empty-' + Date.now() + '.jsonl')
  fs.writeFileSync(emptyFile, '')
  await withServer(4400, emptyFile, async (base) => {
    const er = await get(base + '/api/stats')
    const es = er.json()
    pass('空数据 -> 200', er.status === 200)
    pass('空数据 -> 全 0', es && es.total === 0 && es.today === 0 && es.streak === 0 && es.activeDays === 0 && es.ides.length === 0 && es.languages.length === 0 && sum(es.hours) === 0)
    const eidx = (await get(base + '/')).text
    pass('空数据 -> 页面可访问', eidx.includes('app.js'))
  })
  fs.unlinkSync(emptyFile)

  console.log('')
  console.log('=== 5. 脏数据容错（独立服务器 :4401） ===')
  const dirtyFile = path.join(os.tmpdir(), 'codestats-dirty-' + Date.now() + '.jsonl')
  fs.writeFileSync(dirtyFile, [
    '{"date":"2026-08-01","ide":"trae","file":"a.ts","lines":10,"ts":1754000000000}',
    '这不是合法的json{{{',
    '{"date":"2026-08-01","ide":"vscode","file":"b.py","lines":5,"ts":1754003600000}',
    '{"date":"2026-08-01","ide":"trae","file":"c.md","lines":2,"ts":1754007200000}',
    '{"lines":99}',
    '',
  ].join('\n'))
  await withServer(4401, dirtyFile, async (base) => {
    const dr = await get(base + '/api/stats')
    const ds = dr.json()
    pass('脏数据 -> 200', dr.status === 200)
    pass('坏行被跳过，total=17', ds && ds.total === 17, `total=${ds && ds.total}`)
    pass('语言聚合 3 种', ds && ds.languages.length === 3, ds ? ds.languages.map((l) => l.name).join(',') : '')
    pass('IDE 聚合 trae=12/vscode=5', ds && ds.ides.find((i) => i.name === 'trae').lines === 12 && ds.ides.find((i) => i.name === 'vscode').lines === 5)
  })
  fs.unlinkSync(dirtyFile)

  console.log('')
  console.log(failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项失败`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('测试脚本异常:', e); process.exit(1) })
