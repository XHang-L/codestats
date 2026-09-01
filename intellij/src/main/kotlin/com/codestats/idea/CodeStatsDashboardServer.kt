package com.codestats.idea

import com.intellij.openapi.diagnostic.Logger
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Path

/**
 * 本地仪表盘服务器管理：把打包在插件里的 dashboard 资源解压到临时目录，
 * 用 Node 启动 server.js（读 ~/.codestats/daily.jsonl），供 JCEF 侧边栏加载。
 * 如果 4399 端口已有服务（用户手动启动的），直接复用，不重复启动。
 */
object CodeStatsDashboardServer {

    private const val PORT = 4399
    private val log = Logger.getInstance(CodeStatsDashboardServer::class.java)
    private var process: Process? = null
    private var extractedDir: Path? = null

    val url: String get() = "http://127.0.0.1:$PORT"

    /** 确保 4399 有仪表盘服务；返回是否可用 */
    fun ensureRunning(): Boolean {
        if (isPortOpen()) return true
        return try {
            val dir = extractResources()
            extractedDir = dir
            val pb = ProcessBuilder("node", "server.js")
            pb.directory(dir.resolve("dashboard").toFile())
            pb.redirectErrorStream(true)
            process = pb.start()
            waitForPort(6000)
        } catch (e: Exception) {
            log.warn("[codestats] 启动仪表盘服务器失败", e)
            false
        }
    }

    /** 停止我们启动的服务器并清理临时目录（不影响用户手动启动的） */
    fun stop() {
        process?.destroy()
        process = null
        extractedDir?.let {
            runCatching { it.toFile().deleteRecursively() }
            extractedDir = null
        }
    }

    private fun extractResources(): Path {
        val base = Files.createTempDirectory("codestats-dash")
        copyResource("/dashboard-dist/dashboard/server.js", base.resolve("dashboard/server.js"))
        copyResource("/dashboard-dist/extension/stats.js", base.resolve("extension/stats.js"))
        copyResource("/dashboard-dist/extension/webview/index.html", base.resolve("extension/webview/index.html"))
        copyResource("/dashboard-dist/extension/webview/app.js", base.resolve("extension/webview/app.js"))
        copyResource("/dashboard-dist/extension/webview/style.css", base.resolve("extension/webview/style.css"))
        copyResource("/dashboard-dist/extension/webview/webview-adapter.js", base.resolve("extension/webview/webview-adapter.js"))
        return base
    }

    private fun copyResource(resource: String, target: Path) {
        val input = CodeStatsDashboardServer::class.java.getResourceAsStream(resource)
            ?: throw IllegalStateException("插件资源缺失: $resource")
        input.use { `in` ->
            Files.createDirectories(target.parent)
            Files.newOutputStream(target).use { out -> `in`.copyTo(out) }
        }
    }

    private fun isPortOpen(): Boolean = try {
        Socket("127.0.0.1", PORT).use { true }
    } catch (e: Exception) {
        false
    }

    private fun waitForPort(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (isPortOpen()) return true
            Thread.sleep(200)
        }
        return isPortOpen()
    }
}
