'use strict'
// CodeStats Webview 适配器：仅在 VSCode/Trae 侧边栏 Webview 里生效。
// 通过 postMessage 向扩展请求统计（扩展读 JSONL 算好直接返回），
// 并把 <body> 标记为 ide-sidebar 以启用窄栏布局。浏览器里本文件不生效。

;(function () {
  if (typeof acquireVsCodeApi === 'undefined') return

  var vscode = acquireVsCodeApi()
  var pending = new Map()
  var seq = 0

  function request(method, arg) {
    return new Promise(function (resolve, reject) {
      var id = ++seq
      pending.set(id, { resolve: resolve, reject: reject })
      vscode.postMessage({ type: 'request', id: id, method: method, arg: arg })
    })
  }

  window.CodeStatsAPI = {
    stats: function () { return request('stats') },
    day: function (date) { return request('day', date) },
  }

  window.addEventListener('message', function (ev) {
    var msg = ev.data
    if (!msg || msg.type !== 'response') return
    var p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error))
    else p.resolve(msg.data)
  })

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('ide-sidebar')
  })
})()
