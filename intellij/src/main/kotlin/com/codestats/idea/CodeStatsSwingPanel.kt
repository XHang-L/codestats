package com.codestats.idea

import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.SwingConstants
import javax.swing.Timer

/**
 * 精简 Swing 兜底面板（JCEF 不可用或仪表盘服务器启动失败时使用）。
 * 主路径是 CodeStatsToolWindowFactory 里的 JCEF 完整仪表盘。
 */
class CodeStatsPanel : JPanel(BorderLayout()) {

    private val service = CodeStatsService.getInstance()

    private val todayLabel = JLabel("今日：加载中…", SwingConstants.LEFT).apply {
        font = font.deriveFont(Font.BOLD, 20f)
    }
    private val weekLabel = JLabel("本周：—")
    private val streakLabel = JLabel("连续：—")
    private val pathLabel = JLabel("数据：—").apply { foreground = Color.GRAY }
    private val fileList = JList<String>()
    private val heatmap = HeatmapPanel()
    private val bars = IdeBarsPanel()
    private val timer = Timer(10_000) { refresh() }

    init {
        val body = JPanel()
        body.layout = BoxLayout(body, BoxLayout.Y_AXIS)
        body.border = BorderFactory.createEmptyBorder(12, 12, 12, 12)

        body.add(todayLabel)
        body.add(weekLabel)
        body.add(streakLabel)
        body.add(pathLabel)

        body.add(Box.createVerticalStrut(10))
        body.add(sectionTitle("年度热力图"))
        body.add(heatmap)

        body.add(Box.createVerticalStrut(12))
        body.add(sectionTitle("最近 14 天 · 按 IDE 分色"))
        body.add(bars)

        body.add(Box.createVerticalStrut(12))
        body.add(sectionTitle("今日文件"))
        val fileScroll = JScrollPane(fileList)
        fileScroll.preferredSize = Dimension(260, 130)
        fileScroll.maximumSize = Dimension(Int.MAX_VALUE, 130)
        body.add(fileScroll)

        val refreshBtn = JButton("刷新").apply {
            addActionListener { refresh() }
            maximumSize = Dimension(Int.MAX_VALUE, 28)
        }

        add(JScrollPane(body), BorderLayout.CENTER)
        add(refreshBtn, BorderLayout.SOUTH)
        timer.start()
        refresh()
    }

    private fun sectionTitle(text: String): JLabel =
        JLabel(text).apply { foreground = Color.GRAY }

    private fun refresh() {
        val byFile = service.todayByFile()
        val today = byFile.sumOf { it.second }
        todayLabel.text = "今日 $today 行"
        weekLabel.text = "本周 ${service.weekTotal()} 行"
        streakLabel.text = "连续 ${service.streak()} 天"
        pathLabel.text = "数据：${service.dataFile}"
        heatmap.setData(service.yearDayTotals())
        bars.setData(service.lastDaysByIde(14))
        val rows = byFile.take(50).map { (file, lines) ->
            val name = file.substringAfterLast('/').substringAfterLast('\\')
            "$name  ·  $lines 行"
        } + if (byFile.isEmpty()) listOf("还没有记录，写点代码吧 😄") else emptyList()
        val model = javax.swing.DefaultListModel<String>()
        rows.forEach { model.addElement(it) }
        fileList.model = model
    }
}
