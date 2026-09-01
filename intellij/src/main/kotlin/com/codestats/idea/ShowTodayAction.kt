package com.codestats.idea

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

/** 工具菜单 → CodeStats: 今日统计：显示今日各文件行数 */
class ShowTodayAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val service = CodeStatsService.getInstance()
        val byFile = service.todayByFile()
        val total = byFile.sumOf { it.second }

        val body = if (byFile.isEmpty()) {
            "今天还没有记录——写点代码就有了 😄"
        } else {
            byFile.joinToString("\n") { (file, lines) ->
                val name = file.substringAfterLast('/').substringAfterLast('\\')
                "$name  $lines 行"
            }
        }
        val content = "今日共 $total 行（${
            byFile.size
        } 个文件）：\n$body\n\n数据文件：${service.dataFile}"

        NotificationGroupManager.getInstance()
            .getNotificationGroup("CodeStats")
            .createNotification("CodeStats · 今日统计", content, NotificationType.INFORMATION)
            .notify(e.project)
    }
}
