package com.codestats.idea

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser

/** CodeStats 侧边栏：JCEF 内嵌完整 Web 仪表盘（与 VSCode/浏览器完全一致） */
class CodeStatsToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val content = if (JBCefApp.isSupported() && CodeStatsDashboardServer.ensureRunning()) {
            // JCEF 可用 + 本地仪表盘已就绪 → 内嵌完整仪表盘
            val browser = JBCefBrowser()
            browser.loadURL(CodeStatsDashboardServer.url)
            ContentFactory.getInstance().createContent(browser.component, "", false)
        } else {
            // 兜底：JCEF 不可用或服务器启动失败 → 精简 Swing 面板
            ContentFactory.getInstance().createContent(CodeStatsPanel(), "", false)
        }
        // 侧边栏关闭时，停掉本插件启动的服务器（不影响用户手动启动的）
        content.setDisposer(Disposable { CodeStatsDashboardServer.stop() })
        toolWindow.contentManager.addContent(content)
    }
}
