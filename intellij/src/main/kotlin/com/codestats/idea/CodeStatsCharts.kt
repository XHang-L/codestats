package com.codestats.idea

import java.awt.Color
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.JPanel

// 与 Web 仪表盘一致的配色
private val IDE_COLORS = mapOf(
    "trae" to Color(0x2ea043),
    "vscode" to Color(0x3b91ff),
    "idea" to Color(0xa371f7),
    "intellij" to Color(0xa371f7),
    "cursor" to Color(0x7c7f8f),
    "webstorm" to Color(0x3bd6ff),
    "pycharm" to Color(0x3bff9e),
    "goland" to Color(0x3bd0ff),
    "windsurf" to Color(0x6c5cff),
    "unknown" to Color(0x9ca3af),
)
private fun ideColor(name: String): Color = IDE_COLORS[name] ?: Color(0x9ca3af)

private val HEAT_EMPTY = Color(0x21262d)
private val HEAT_LEVELS = arrayOf(Color(0x0e4429), Color(0x006d32), Color(0x26a641), Color(0x39d353))

/** 年度热力图（GitHub 风格，周为列、7 行为星期） */
class HeatmapPanel : JPanel() {
    private var data: List<Pair<String, Long>> = emptyList()

    init {
        preferredSize = Dimension(300, 86)
    }

    fun setData(d: List<Pair<String, Long>>) {
        data = d
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        if (data.isEmpty()) return
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        val cell = 6
        val gap = 2
        val max = (data.maxOfOrNull { it.second } ?: 0L).coerceAtLeast(1)
        var x = 0
        var weekStart = 0
        while (weekStart < data.size) {
            for (r in 0 until 7) {
                val idx = weekStart + r
                if (idx >= data.size) break
                val lines = data[idx].second
                val lv = when {
                    lines <= 0 -> 0
                    lines >= max * 0.75 -> 4
                    lines >= max * 0.5 -> 3
                    lines >= max * 0.25 -> 2
                    else -> 1
                }
                g2.color = if (lv == 0) HEAT_EMPTY else HEAT_LEVELS[lv - 1]
                g2.fillRoundRect(x, r * (cell + gap), cell, cell, 2, 2)
            }
            x += cell + gap
            weekStart += 7
        }
    }
}

/** 最近 N 天按 IDE 堆叠柱状图 */
class IdeBarsPanel : JPanel() {
    private var data: List<Pair<String, Map<String, Long>>> = emptyList()

    init {
        preferredSize = Dimension(300, 110)
    }

    fun setData(d: List<Pair<String, Map<String, Long>>>) {
        data = d
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        if (data.isEmpty()) return
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        val max = (data.maxOfOrNull { it.second.values.sum() } ?: 0L).coerceAtLeast(1)
        val h = height - 14
        val barW = (width / data.size).coerceAtLeast(5)
        for ((i, day) in data.withIndex()) {
            val x = i * barW
            var y = height - 8
            val segs = day.second.entries.sortedByDescending { it.value }
            if (segs.isEmpty()) {
                g2.color = HEAT_EMPTY
                g2.fillRect(x + 1, height - 8, barW - 2, 3)
                continue
            }
            for ((ide, lines) in segs) {
                val sh = (lines.toDouble() / max * h).toInt().coerceAtLeast(1)
                g2.color = ideColor(ide)
                g2.fillRect(x + 1, y - sh, barW - 2, sh)
                y -= sh
            }
        }
        // 基线
        g2.color = Color(0x30363d)
        g2.drawLine(0, height - 9, width, height - 9)
    }
}
