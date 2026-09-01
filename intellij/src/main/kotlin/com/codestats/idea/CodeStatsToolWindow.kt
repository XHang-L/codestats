package com.codestats.idea

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.SwingConstants
import javax.swing.Timer

/** CodeStats 侧边栏面板：今日 / 本周 / 连续天数 / 今日文件明细 */
class CodeStatsToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        toolWindow.contentManager.addContent(
            com.intellij.ui.content.ContentFactory.getInstance().createContent(CodeStatsPanel(), "", false)
        )
    }
}

class CodeStatsPanel : JPanel(BorderLayout(0, 8)) {

    private val service = CodeStatsService.getInstance()

    private val todayLabel = JLabel("今日：加载中…", SwingConstants.LEFT).apply {
        font = font.deriveFont(Font.BOLD, 20f)
    }
    private val weekLabel = JLabel("本周：—")
    private val streakLabel = JLabel("连续：—")
    private val pathLabel = JLabel("数据：—").apply { foreground = Color.GRAY }
    private val fileList = JList<String>()
    private val timer = Timer(10_000) { refresh() }

    init {
        border = BorderFactory.createEmptyBorder(12, 12, 12, 12)

        val top = JPanel()
        top.layout = BoxLayout(top, BoxLayout.Y_AXIS)
        top.add(todayLabel)
        top.add(weekLabel)
        top.add(streakLabel)
        top.add(pathLabel)

        val filesTitle = JLabel("今日文件").apply { foreground = Color.GRAY }

        val center = JPanel(BorderLayout(0, 4))
        center.add(filesTitle, BorderLayout.NORTH)
        center.add(JScrollPane(fileList), BorderLayout.CENTER)

        val refreshBtn = JButton("刷新").apply {
            addActionListener { refresh() }
            preferredSize = Dimension(Int.MAX_VALUE, 28)
            maximumSize = Dimension(Int.MAX_VALUE, 28)
        }

        add(top, BorderLayout.NORTH)
        add(center, BorderLayout.CENTER)
        add(refreshBtn, BorderLayout.SOUTH)

        timer.start()
        refresh()
    }

    private fun refresh() {
        val byFile = service.todayByFile()
        val today = byFile.sumOf { it.second }
        todayLabel.text = "今日 $today 行"
        weekLabel.text = "本周 ${service.weekTotal()} 行"
        streakLabel.text = "连续 ${service.streak()} 天"
        pathLabel.text = "数据：${service.dataFile}"
        val rows = byFile.take(50).map { (file, lines) ->
            val name = file.substringAfterLast('/').substringAfterLast('\\')
            "$name  ·  $lines 行"
        } + if (byFile.isEmpty()) listOf("还没有记录，写点代码吧 😄") else emptyList()
        val model = javax.swing.DefaultListModel<String>()
        rows.forEach { model.addElement(it) }
        fileList.model = model
    }
}
