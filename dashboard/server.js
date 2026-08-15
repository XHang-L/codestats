'use strict'
// CodeStats 仪表盘 —— 零依赖的本地服务器（前端 + 聚合逻辑与 IDE 侧边栏 Webview 共用）
// 用法：
//   node dashboard/server.js                  # 默认读取 ~/.codestats/daily.jsonl
//   CODESTATS_FILE=xxx node dashboard/server.js  # 读取指定数据文件（如样例数据）
//   PORT=8888 node dashboard/server.js        # 换端口（默认 4399）
// 打开 http://127.0.0.1:4399 查看仪表盘

const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const stats = require('../extension/stats.js')

const PORT = Number(process.env.PORT) || 4399
const DATA_FILE = process.env.CODESTATS_FILE || path.join(os.homedir(), '.codestats', 'daily.jsonl')
const ROOT = path.join(__dirname, '..', 'extension', 'webview')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(stats.buildStats(DATA_FILE)))
    return
  }

  if (url.pathname === '/api/day') {
    const date = url.searchParams.get('date') || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'invalid date' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(stats.buildDay(DATA_FILE, date)))
    return
  }

  if (url.pathname === '/api/refresh') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, dataFile: DATA_FILE, exists: fs.existsSync(DATA_FILE) }))
    return
  }

  // 静态文件（extension/webview/）
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  CodeStats 仪表盘已启动')
  console.log(`  → http://127.0.0.1:${PORT}`)
  console.log(`  数据文件: ${DATA_FILE}（${fs.existsSync(DATA_FILE) ? '存在' : '不存在，等扩展写入或先生成样例数据'}）`)
  console.log('  按 Ctrl+C 停止')
  console.log('')
})
