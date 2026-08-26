'use strict'
// CodeStats 仪表盘渲染逻辑
// 功能：汇总卡片 · 周报横幅 · 年度热力图(点击下钻) · 趋势曲线(周/月/年)
//       · 按 IDE 分色柱状图 · IDE/语言占比 · 活跃时段 · 每日目标环
//
// 数据源适配：浏览器里默认走 fetch(/api/*)；
// IDE 侧边栏 Webview 里由 webview-adapter.js 注入 postMessage 版 CodeStatsAPI。

window.CodeStatsAPI = window.CodeStatsAPI || {
  stats: () => fetch('/api/stats', { cache: 'no-store' }).then((r) => r.json()),
  day: (date) => fetch('/api/day?date=' + date, { cache: 'no-store' }).then((r) => r.json()),
}

const IDE_COLORS = {
  trae: '#2ea043',        // 绿
  vscode: '#3b91ff',      // 蓝
  cursor: '#7c7f8f',
  idea: '#a371f7',        // 紫（IntelliJ IDEA）
  intellij: '#a371f7',    // 紫（别名，兼容不同命名）
  webstorm: '#3bd6ff',
  pycharm: '#3bff9e',
  goland: '#3bd0ff',
  windsurf: '#6c5cff',
  unknown: '#9ca3af',
}
const LANG_COLORS = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Vue: '#41b883',
  HTML: '#e34c26', CSS: '#563d7c', JSON: '#8b95a3', Markdown: '#519aba', YAML: '#cb171e',
  SQL: '#e38c00', Shell: '#89e051', PowerShell: '#012456', XML: '#0060ac',
  TOML: '#8b95a3', Text: '#8b95a3', 其他: '#9ca3af',
}
const FALLBACK_COLORS = ['#a371f7', '#f778ba', '#e3b341', '#56d364', '#58a6ff', '#ff7b72']
function colorOf(map, name) {
  if (map[name]) return map[name]
  let h = 0
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}
const ideColor = (n) => colorOf(IDE_COLORS, n)
const langColor = (n) => colorOf(LANG_COLORS, n)

function fmt(n) {
  return Number(n).toLocaleString('zh-CN')
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 平滑曲线：Catmull-Rom 样条转三次贝塞尔（穿过所有数据点）
// yClamp = [yMin, yMax]：把控制点钳制在数据范围内，防止平滑曲线超调到 0 行以下
function smoothPath(points, yClamp) {
  const n = points.length
  if (n === 0) return ''
  const clampY = yClamp ? (v) => Math.min(yClamp[1], Math.max(yClamp[0], v)) : (v) => v
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  if (n < 2) return d
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6)
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6)
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

const state = { stats: null, range: 'month', selDate: null, goal: Number(localStorage.getItem('codestats-goal')) || 100 }

const ICONS = {
  lines: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  today: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  streak: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 8-3.6 8-8 0-3-1.5-5.5-3-7.5-.4 1.5-1 2.5-2 3.5 0-4-2.5-7-5.5-9 0 4-1.5 5.5-2.5 7C5.8 9.8 4 12.2 4 14c0 4.4 3.6 8 8 8z"/></svg>',
  active: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  goal: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v
      else if (k === 'title') node.title = v
      else if (k === 'text') node.textContent = v
      else if (k === 'html') node.innerHTML = v
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
      else node.setAttribute(k, v)
    }
  }
  // 兼容两种写法：el(tag, attrs, a, b, c) 或 el(tag, attrs, [a, b, c])
  const list = children.length === 1 && Array.isArray(children[0]) ? children[0] : children
  for (const c of list) {
    if (c === null || c === undefined) continue
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

// 目标环渐变定义（隐藏 SVG，供 CSS url(#ringGrad) 引用）
function ensureRingGradient() {
  if (document.getElementById('ring-grad-def')) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('id', 'ring-grad-def')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  svg.innerHTML =
    '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#238636"/><stop offset="1" stop-color="#39d353"/></linearGradient></defs>'
  document.body.appendChild(svg)
}

// ── 每周总结 + 环比 ───────────────────────────────────────
function renderWeekBanner(s) {
  const box = document.getElementById('week-banner')
  const r = s.rolling
  const thisWeek = r.slice(-7).reduce((a, d) => a + d.total, 0)
  const lastWeek = r.slice(-14, -7).reduce((a, d) => a + d.total, 0)
  const pct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : thisWeek > 0 ? 100 : 0
  const up = pct >= 0
  box.className = 'banner show'
  box.replaceChildren(
    el('span', { class: 'b-label', text: '本周总结' }),
    el('span', { class: 'b-strong', text: `本周 ${fmt(thisWeek)} 行` }),
    el('span', { class: up ? 'b-up' : 'b-down', text: `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% 较上周` }),
    el('span', { class: 'b-label', text: `日均 ${fmt(Math.round(thisWeek / 7))} 行` }),
  )
}

// ── 汇总卡片（含今日目标环）────────────────────────────────
function renderCards(s) {
  const cards = document.getElementById('summary-cards')
  cards.replaceChildren(
    card('今年总行数', fmt(s.total), '1 月 1 日至今', 'lines', ''),
    card('今日', fmt(s.today), s.todayKey, 'today', 'hot'),
    card('连续天数', s.streak + ' 天', '截至今天连续写代码', 'streak', ''),
    card('活跃天数', s.activeDays + ' 天', '今年有记录的天数', 'active', ''),
    goalCard(s),
  )
  function card(k, v, hint, icon, extra) {
    return el('div', { class: 'card ' + extra },
      el('div', { class: 'card-top' },
        el('span', { class: 'k', text: k }),
        el('span', { class: 'icon', html: ICONS[icon] })),
      el('div', { class: 'v', text: v }),
      el('div', { class: 'hint', text: hint }))
  }
}

function goalCard(s) {
  const pct = Math.min(1, s.today / state.goal)
  const C = 2 * Math.PI * 26
  const dash = (pct * C).toFixed(1)
  const ringSvg = `<svg class="ring" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${dash} ${C.toFixed(1)}"/></svg>`

  const card = el('div', { class: 'card goal' },
    el('div', { class: 'card-top' },
      el('span', { class: 'k', text: '今日目标' }),
      el('span', { class: 'icon', html: ICONS.goal })),
    el('div', { class: 'ring-wrap' },
      el('span', { html: ringSvg }),
      el('div', {},
        el('div', { class: 'goal-text' },
          el('span', { class: 'cur', text: fmt(s.today) }),
          document.createTextNode(` / ${fmt(state.goal)} 行`)),
        el('input', { class: 'goal-edit', type: 'number', value: String(state.goal) })),
      el('span', { class: 'goal-hit', text: pct >= 1 ? '✓' : '' })),
    el('div', { class: 'hint goal-hint', text: '点击数字修改每日目标' }))

  // 内联编辑：点提示/数字 → 输入框 → Enter/失焦保存
  const hintEl = card.querySelector('.goal-hint')
  const textEl = card.querySelector('.goal-text')
  const input = card.querySelector('.goal-edit')
  const enterEdit = () => {
    card.classList.add('editing')
    input.focus()
    input.select()
  }
  hintEl.addEventListener('click', enterEdit)
  textEl.addEventListener('click', enterEdit)
  const commit = () => {
    card.classList.remove('editing')
    const v = Number(input.value)
    if (Number.isFinite(v) && v > 0) {
      state.goal = Math.min(99999, Math.round(v))
      localStorage.setItem('codestats-goal', String(state.goal))
    }
    if (state.stats) renderCards(state.stats)
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } })
  input.addEventListener('blur', commit)
  return card
}

// ── 年度热力图（自然年，点击下钻）─────────────────────────
function renderHeatmap(s) {
  const box = document.getElementById('heatmap')
  const range = document.getElementById('heatmap-range')
  const days = s.days
  range.textContent = `${days[0].date} ~ ${days[days.length - 1].date}`

  const max = Math.max(1, ...days.map((d) => d.total))
  const level = (n) => {
    if (n <= 0) return 0
    if (n >= max * 0.75) return 4
    if (n >= max * 0.5) return 3
    if (n >= max * 0.25) return 2
    return 1
  }

  const first = new Date(days[0].date + 'T00:00:00')
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())
  const byDate = new Map(days.map((d) => [d.date, d]))

  const monthsWrap = el('div', { class: 'heatmap-months' })
  const grid = el('div', { class: 'hm' })

  const weekCount = Math.ceil((days.length + first.getDay()) / 7)
  let lastMonth = -1
  for (let w = 0; w < weekCount; w++) {
    const col = el('div', { class: 'hm-col' })
    for (let r = 0; r < 7; r++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + w * 7 + r)
      const key = fmtDate(d)
      const day = byDate.get(key)
      const n = day ? day.total : 0
      const lv = level(n)
      const cell = el('i', {
        class: 'cell' + (lv ? ' l' + lv : '') + (key === s.todayKey ? ' today' : '') + (key === state.selDate ? ' sel' : ''),
        title: n > 0 ? `${key}：${fmt(n)} 行（点击看明细）` : `${key}（点击看明细）`,
      })
      cell.addEventListener('click', () => selectDay(key))
      col.appendChild(cell)
    }
    const firstOfCol = new Date(gridStart)
    firstOfCol.setDate(gridStart.getDate() + w * 7)
    const newMonth = firstOfCol.getMonth() !== lastMonth
    const extra = newMonth && w > 0 ? 10 : 0
    if (extra) col.style.marginLeft = extra + 'px'
    if (newMonth) {
      lastMonth = firstOfCol.getMonth()
      const s2 = el('span', { text: `${firstOfCol.getMonth() + 1}月` })
      if (extra) s2.style.marginLeft = extra + 'px'
      monthsWrap.appendChild(s2)
    } else {
      monthsWrap.appendChild(el('span'))
    }
    grid.appendChild(col)
  }

  box.replaceChildren(monthsWrap, grid)
}

async function selectDay(date) {
  const box = document.getElementById('day-detail')
  document.querySelectorAll('#heatmap .cell.sel').forEach((c) => c.classList.remove('sel'))
  if (state.selDate === date) {
    state.selDate = null
    box.classList.add('hidden')
    return
  }
  state.selDate = date
  document.querySelectorAll('#heatmap .cell').forEach((c) => {
    if (c.title && c.title.startsWith(date)) c.classList.add('sel')
  })
  box.classList.remove('hidden')
  box.replaceChildren(el('div', { class: 'placeholder', text: '加载中…' }))
  try {
    const res = await CodeStatsAPI.day(date)
    renderDayDetail(res)
  } catch (err) {
    box.replaceChildren(el('div', { class: 'placeholder', text: '加载失败：' + String(err) }))
  }
}

function renderDayDetail(data) {
  const box = document.getElementById('day-detail')
  const close = el('button', { class: 'dd-close', type: 'button', text: '关闭' })
  close.addEventListener('click', () => {
    box.classList.add('hidden')
    state.selDate = null
    document.querySelectorAll('#heatmap .cell.sel').forEach((c) => c.classList.remove('sel'))
  })
  const ideRows = Object.entries(data.byIde)
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => el('div', { class: 'dd-ide' },
      el('i', { class: 'dot', style: `background:${ideColor(name)}` }),
      document.createTextNode(`${name}：${fmt(v)} 行`)))
  const fileRows = data.files.map((f) =>
    el('div', { class: 'dd-file' },
      el('code', { text: f.file }),
      el('span', { text: `${fmt(f.lines)} 行` })))
  box.replaceChildren(
    el('div', { class: 'dd-head' },
      el('span', { class: 'dd-title', text: `${data.date} · 共 ${fmt(data.total)} 行` }),
      close),
    el('div', { class: 'dd-grid' },
      el('div', {},
        el('h4', { text: '按 IDE' }),
        ...(ideRows.length ? ideRows : [el('div', { class: 'placeholder', text: '无记录' })])),
      el('div', {},
        el('h4', { text: '按文件 · Top 15' }),
        ...(fileRows.length ? fileRows : [el('div', { class: 'placeholder', text: '无记录' })])),
    ),
  )
}

// ── 趋势曲线（SVG 平滑折线 + 渐变面积 + 悬浮提示）──────────
function renderTrend(s) {
  const box = document.getElementById('trend')
  const rangeLabel = document.getElementById('trend-range')
  let days
  if (state.range === 'year') {
    days = s.days.filter((d) => d.date <= s.todayKey) // 年视图：今年 1月1日 至今
  } else {
    days = s.rolling.slice(-(state.range === 'week' ? 7 : 30))
  }
  const n = days.length
  const total = days.reduce((a, d) => a + d.total, 0)
  const avg = days.length ? Math.round(total / days.length) : 0
  rangeLabel.textContent = `${days[0].date} ~ ${days[days.length - 1].date} · 日均 ${fmt(avg)} 行`

  const W = Math.max(320, box.clientWidth || 900)
  const H = 230
  const PAD = { top: 20, right: 16, bottom: 28, left: 48 }
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const max = Math.max(1, ...days.map((d) => d.total))
  const NS = 'http://www.w3.org/2000/svg'

  const x = (i) => PAD.left + (n <= 1 ? 0 : (i * iw) / (n - 1))
  const y = (v) => PAD.top + ih - (v / max) * ih

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', W)
  svg.setAttribute('height', H)
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)

  const defs = document.createElementNS(NS, 'defs')
  defs.innerHTML =
    '<linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#2ea043"/><stop offset="1" stop-color="#39d353"/></linearGradient>' +
    '<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#2ea043" stop-opacity="0.25"/>' +
    '<stop offset="1" stop-color="#2ea043" stop-opacity="0.02"/></linearGradient>'
  svg.appendChild(defs)

  for (let g = 0; g <= 3; g++) {
    const gy = PAD.top + (g * ih) / 3
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('x1', PAD.left)
    line.setAttribute('y1', gy)
    line.setAttribute('x2', W - PAD.right)
    line.setAttribute('y2', gy)
    line.setAttribute('stroke', 'rgba(148,163,184,0.12)')
    line.setAttribute('stroke-width', '1')
    svg.appendChild(line)
    const txt = document.createElementNS(NS, 'text')
    txt.setAttribute('x', PAD.left - 8)
    txt.setAttribute('y', gy + 3.5)
    txt.setAttribute('text-anchor', 'end')
    txt.setAttribute('font-size', '10')
    txt.setAttribute('fill', '#8b95a3')
    txt.textContent = Math.round(max - (g * max) / 3)
    svg.appendChild(txt)
  }

  const pts = days.map((d, i) => ({ x: x(i), y: y(d.total) }))
  const linePath = smoothPath(pts, [PAD.top, PAD.top + ih]) // 控制点钳制在图表范围内，避免曲线低于 0 行
  const areaPath = linePath + ` L${x(n - 1).toFixed(1)},${(PAD.top + ih).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + ih).toFixed(1)} Z`
  const area = document.createElementNS(NS, 'path')
  area.setAttribute('d', areaPath)
  area.setAttribute('fill', 'url(#areaGrad)')
  const line = document.createElementNS(NS, 'path')
  line.setAttribute('d', linePath)
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', 'url(#lineGrad)')
  line.setAttribute('stroke-width', '2')
  line.setAttribute('stroke-linejoin', 'round')
  line.setAttribute('stroke-linecap', 'round')
  svg.appendChild(area)
  svg.appendChild(line)

  const tickStep = n <= 10 ? 1 : n <= 60 ? Math.ceil(n / 8) : 30
  const ticks = []
  for (let i = 0; i < n; i += tickStep) ticks.push(i)
  if (ticks[ticks.length - 1] !== n - 1) ticks.push(n - 1)
  for (const i of ticks) {
    const d = days[i]
    const label = n > 90 ? `${Number(d.date.slice(5, 7))}月` : d.date.slice(5)
    const txt = document.createElementNS(NS, 'text')
    txt.setAttribute('x', x(i))
    txt.setAttribute('y', H - 8)
    txt.setAttribute('text-anchor', 'middle')
    txt.setAttribute('font-size', '10')
    txt.setAttribute('fill', '#8b95a3')
    txt.textContent = label
    svg.appendChild(txt)
  }

  const overlay = document.createElementNS(NS, 'rect')
  overlay.setAttribute('x', PAD.left)
  overlay.setAttribute('y', PAD.top)
  overlay.setAttribute('width', iw)
  overlay.setAttribute('height', ih)
  overlay.setAttribute('fill', 'transparent')
  const guide = document.createElementNS(NS, 'line')
  guide.setAttribute('stroke', 'rgba(255,255,255,0.35)')
  guide.setAttribute('stroke-width', '1')
  guide.setAttribute('stroke-dasharray', '3 3')
  guide.setAttribute('y1', PAD.top)
  guide.setAttribute('y2', PAD.top + ih)
  guide.style.display = 'none'
  const dot = document.createElementNS(NS, 'circle')
  dot.setAttribute('r', '4')
  dot.setAttribute('fill', '#39d353')
  dot.setAttribute('stroke', '#fff')
  dot.setAttribute('stroke-width', '1.5')
  dot.style.display = 'none'
  svg.appendChild(overlay)
  svg.appendChild(guide)
  svg.appendChild(dot)

  const tip = el('div', { class: 'trend-tip' })
  overlay.addEventListener('mousemove', (ev) => {
    const rect = box.getBoundingClientRect()
    const mx = ev.clientX - rect.left
    const ratio = (mx - PAD.left) / iw
    const i = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))))
    const d = days[i]
    guide.setAttribute('x1', x(i))
    guide.setAttribute('x2', x(i))
    guide.style.display = ''
    dot.setAttribute('cx', x(i))
    dot.setAttribute('cy', y(d.total))
    dot.style.display = ''
    tip.textContent = `${d.date}：${fmt(d.total)} 行`
    tip.className = 'trend-tip show'
    tip.style.left = Math.min(rect.width - 130, Math.max(8, x(i))) + 'px'
    tip.style.top = '8px'
  })
  overlay.addEventListener('mouseleave', () => {
    guide.style.display = 'none'
    dot.style.display = 'none'
    tip.className = 'trend-tip'
  })

  box.replaceChildren(svg, tip)
}

// ── 按 IDE 分色柱状图（跟随范围切换；年视图按周聚合）────────
function renderIdeChart(s) {
  const box = document.getElementById('ide-chart')
  const legend = document.getElementById('ide-legend')
  const title = document.getElementById('ide-chart-title')

  let buckets
  let bucketLabel
  if (state.range === 'year') {
    const src = s.days.filter((d) => d.date <= s.todayKey)
    const map = new Map()
    for (const d of src) {
      const dt = new Date(d.date + 'T00:00:00')
      const sun = new Date(dt)
      sun.setDate(dt.getDate() - dt.getDay())
      const key = fmtDate(sun)
      if (!map.has(key)) map.set(key, { date: key, total: 0, byIde: {} })
      const b = map.get(key)
      b.total += d.total
      for (const [ide, v] of Object.entries(d.byIde)) b.byIde[ide] = (b.byIde[ide] || 0) + v
    }
    buckets = [...map.values()]
    bucketLabel = (b) => `${b.date} 周`
    title.textContent = '今年 · 按周聚合 · 按 IDE 分色'
  } else {
    const n = state.range === 'week' ? 7 : 30
    buckets = s.rolling.slice(-n)
    bucketLabel = (b) => b.date
    title.textContent = `最近 ${n} 天 · 按 IDE 分色`
  }

  const max = Math.max(1, ...buckets.map((d) => d.total))
  const chart = el('div', { class: 'ide-chart' })
  for (const day of buckets) {
    const col = el('div', { class: 'day' })
    const tipLines = Object.entries(day.byIde)
      .sort((a, b) => b[1] - a[1])
      .map(([name, v]) => el('div', { text: `${name}：${fmt(v)} 行` }))
    tipLines.unshift(el('div', { text: `${bucketLabel(day)} · 共 ${fmt(day.total)} 行` }))
    const tip = el('div', { class: 'tip' }, tipLines)
    const segs = Object.entries(day.byIde).sort((a, b) => b[1] - a[1])
    for (const [name, v] of segs) {
      const h = Math.max(2, Math.round((v / max) * 100))
      col.appendChild(el('div', { class: 'seg', style: `height:${h}%;background:${ideColor(name)}` }))
    }
    if (day.total === 0) col.style.background = 'var(--cell-empty)'
    col.appendChild(tip)
    chart.appendChild(col)
  }

  const used = [...new Set(buckets.flatMap((d) => Object.keys(d.byIde)))]
  used.sort((a, b) => (s.ides.find((i) => i.name === b) || { lines: 0 }).lines - (s.ides.find((i) => i.name === a) || { lines: 0 }).lines)
  legend.replaceChildren(...used.map((name) =>
    el('span', { class: 'item' },
      el('i', { class: 'dot', style: `background:${ideColor(name)}` }),
      document.createTextNode(name))))

  box.replaceChildren(chart)
}

// ── 占比列表（IDE / 语言 共用）───────────────────────────
function renderBreakdown(boxId, items, total, colorFn) {
  const box = document.getElementById(boxId)
  if (!items.length) {
    box.replaceChildren(el('div', { class: 'placeholder', text: '还没有数据' }))
    return
  }
  const max = items[0].lines
  const rows = items.slice(0, 10).map((it) =>
    el('div', { class: 'row' },
      el('span', { class: 'name' },
        el('i', { class: 'dot', style: `background:${colorFn(it.name)}` }),
        document.createTextNode(it.name)),
      el('div', { class: 'bar' },
        el('div', { class: 'fill', style: `width:${Math.max(2, (it.lines / max) * 100)}%;background:${colorFn(it.name)}` })),
      el('span', { class: 'num', text: `${fmt(it.lines)} 行 · ${total ? ((it.lines / total) * 100).toFixed(1) : 0}%` })))
  box.replaceChildren(...rows)
}

// ── 活跃时段（24 小时）───────────────────────────────────
function renderHours(s) {
  const box = document.getElementById('hours-chart')
  const max = Math.max(1, ...s.hours)
  const nowH = new Date().getHours()
  const bars = s.hours.map((v, h) => {
    const bar = el('div', { class: 'h' + (v > 0 ? ' on' : '') + (h === nowH ? ' now' : '') })
    bar.style.height = Math.max(2, Math.round((v / max) * 100)) + '%'
    bar.appendChild(el('div', { class: 'tip', text: `${h}时：${fmt(v)} 行` }))
    return bar
  })
  box.replaceChildren(...bars)
}

// ── 主流程 ────────────────────────────────────────────────
async function load() {
  try {
    const s = await CodeStatsAPI.stats()
    state.stats = s
    renderWeekBanner(s)
    renderCards(s)
    renderHeatmap(s)
    renderTrend(s)
    renderIdeChart(s)
    renderBreakdown('ide-breakdown', s.ides, s.total, ideColor)
    renderBreakdown('lang-breakdown', s.languages, s.total, langColor)
    renderHours(s)
    document.getElementById('footer').textContent = `数据文件：${s.dataFile}`
    document.getElementById('last-updated').textContent = `更新于 ${new Date().toLocaleTimeString()}`
  } catch (err) {
    console.error('加载失败', err)
    document.getElementById('heatmap').innerHTML = '<div class="placeholder">加载失败：' + String(err) + '</div>'
  }
}

// 周/月/年切换
document.querySelectorAll('#range-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.range = btn.dataset.range
    document.querySelectorAll('#range-seg button').forEach((b) => b.classList.toggle('active', b === btn))
    if (state.stats) {
      renderTrend(state.stats)
      renderIdeChart(state.stats)
    }
  })
})

document.getElementById('refresh').addEventListener('click', load)
ensureRingGradient()
load()
setInterval(load, 60000)
