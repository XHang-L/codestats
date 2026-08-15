'use strict'
// CodeStats —— VSCode / Trae 等 VSCode 系 IDE 的本地代码行数统计扩展
// 原理：监听文档编辑事件，统计"插入的换行数"作为新增行数，
//       按 (日期, IDE, 文件) 聚合，定时追加写入 ~/.codestats/daily.jsonl
// 纯 CommonJS，无编译、无第三方依赖。

const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const os = require('os')
const lib = require('./lib.js')

function activate(context) {
  const cfg = vscode.workspace.getConfiguration('codestats')
  const dataDir = cfg.get('dataDir') || path.join(os.homedir(), '.codestats')
  const dataFile = path.join(dataDir, 'daily.jsonl')
  const flushIntervalMs = Math.max(5, Number(cfg.get('flushIntervalSeconds')) || 30) * 1000
  try {
    fs.mkdirSync(dataDir, { recursive: true })
  } catch (err) {
    console.error('[codestats] 无法创建数据目录', dataDir, err)
  }

  // 内存聚合表：key = `date\u0000ide\u0000file` → lines
  const pending = new Map()
  let dirty = false

  const today = () => lib.localToday()
  const ide = () => lib.detectIde(vscode.env.appName)

  function bump(document, change) {
    if (document.uri.scheme !== 'file') return
    // 只统计"插入的换行数"：回车、粘贴多行都会 +N；单行内打字/删除不计
    const added = lib.countAddedLines(change.text)
    if (added === 0) return
    let file = vscode.workspace.asRelativePath(document.uri, false)
    if (file.startsWith('..')) file = document.uri.fsPath
    const key = today() + '\u0000' + ide() + '\u0000' + file
    pending.set(key, (pending.get(key) || 0) + added)
    dirty = true
    if (pending.size >= 300) flush()
    refreshStatus()
  }

  function flush() {
    if (!dirty) return
    const rows = []
    for (const [key, count] of pending) {
      const parts = key.split('\u0000')
      rows.push(JSON.stringify({ date: parts[0], ide: parts[1], file: parts[2], lines: count, ts: Date.now() }))
    }
    try {
      fs.appendFileSync(dataFile, rows.join('\n') + '\n')
      pending.clear()
      dirty = false
    } catch (err) {
      console.error('[codestats] 写入失败', dataFile, err)
    }
  }

  // ── 状态栏：显示今日行数 ────────────────────────────────────────────────
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.command = 'codestats.showToday'
  function refreshStatus() {
    let total = 0
    for (const count of pending.values()) total += count
    status.text = `$(pencil) 今日 +${total} 行`
    status.tooltip = 'CodeStats：今天写了 ' + total + ' 行（未落盘）'
    status.show()
  }

  // ── 今日统计命令：含按 IDE 拆分 ─────────────────────────────────────────
  async function showToday() {
    const date = today()
    const byIde = new Map()
    // 已落盘部分
    try {
      if (fs.existsSync(dataFile)) {
        const text = fs.readFileSync(dataFile, 'utf8')
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const r = JSON.parse(line)
            if (r.date === date) byIde.set(r.ide || 'unknown', (byIde.get(r.ide || 'unknown') || 0) + (Number(r.lines) || 0))
          } catch { /* 跳过坏行 */ }
        }
      }
    } catch (err) {
      console.error('[codestats] 读取失败', err)
    }
    // 未落盘部分
    for (const [key, count] of pending) {
      const parts = key.split('\u0000')
      if (parts[0] === date) byIde.set(parts[1], (byIde.get(parts[1]) || 0) + count)
    }
    const parts = [...byIde.entries()].map(([name, lines]) => `${name}: ${lines} 行`).join('，')
    const total = [...byIde.values()].reduce((a, b) => a + b, 0)
    const msg = `CodeStats 今日(${date})共 ${total} 行 —— ${parts || '还没有记录'}`
    const action = await vscode.window.showInformationMessage(msg, '打开仪表盘')
    if (action === '打开仪表盘') openDashboard()
  }

  // ── 打开仪表盘命令：启动本地服务器并打开浏览器 ─────────────────────────
  function openDashboard() {
    const cp = require('child_process')
    const serverDir = path.join(__dirname, '..', 'dashboard')
    const serverFile = path.join(serverDir, 'server.js')
    if (!fs.existsSync(serverFile)) {
      vscode.window.showWarningMessage('未找到仪表盘 (dashboard/server.js)。请先运行 npm start 或 node dashboard/server.js。')
      return
    }
    // 若 4399 端口已有服务（可能是之前起的），直接打开即可
    const port = 4399
    const url = `http://127.0.0.1:${port}`
    const proc = cp.spawn(process.execPath, [serverFile], {
      cwd: serverDir,
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    })
    proc.unref()
    setTimeout(() => vscode.env.openExternal(vscode.Uri.parse(url)), 800)
  }

  // ── IDE 侧边栏：内嵌仪表盘 Webview ─────────────────────────────────────
  const webviewDir = path.join(__dirname, 'webview')
  const statsLib = require('./stats.js')

  class CodeStatsSidebar {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(webviewDir)],
      }
      webviewView.webview.html = this.buildHtml(webviewView.webview)
      webviewView.webview.onDidReceiveMessage(async (msg) => {
        if (!msg || msg.type !== 'request') return
        try {
          let data = null
          if (msg.method === 'stats') data = statsLib.buildStats(dataFile)
          else if (msg.method === 'day') data = statsLib.buildDay(dataFile, String(msg.arg || ''))
          webviewView.webview.postMessage({ type: 'response', id: msg.id, data })
        } catch (err) {
          webviewView.webview.postMessage({ type: 'response', id: msg.id, error: String(err) })
        }
      })
    }

    buildHtml(wv) {
      const base = vscode.Uri.file(webviewDir)
      const cssUri = wv.asWebviewUri(vscode.Uri.joinPath(base, 'style.css'))
      const adapterUri = wv.asWebviewUri(vscode.Uri.joinPath(base, 'webview-adapter.js'))
      const appUri = wv.asWebviewUri(vscode.Uri.joinPath(base, 'app.js'))
      let html = fs.readFileSync(path.join(webviewDir, 'index.html'), 'utf8')
      const csp =
        `default-src 'none'; img-src ${wv.cspSource} data:; ` +
        `style-src ${wv.cspSource} 'unsafe-inline'; script-src ${wv.cspSource} 'unsafe-inline'; font-src ${wv.cspSource}`
      return html
        .replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
        .replace('href="style.css"', `href="${cssUri}"`)
        .replace('src="webview-adapter.js"', `src="${adapterUri}"`)
        .replace('src="app.js"', `src="${appUri}"`)
    }
  }

  const sidebar = new CodeStatsSidebar()

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codestats.view', sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('codestats.openSidebar', () => vscode.commands.executeCommand('codestats.view.focus')),
  )

  const timer = setInterval(flush, flushIntervalMs)

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      for (const change of e.contentChanges) bump(e.document, change)
    }),
    vscode.commands.registerCommand('codestats.showToday', showToday),
    vscode.commands.registerCommand('codestats.openDashboard', openDashboard),
    status,
    {
      dispose: () => {
        clearInterval(timer)
        flush() // 退出前落盘
      },
    },
  )

  refreshStatus()
}

function deactivate() {
  // 清理由 subscriptions 的 dispose 完成（flush）
}

module.exports = { activate, deactivate }
