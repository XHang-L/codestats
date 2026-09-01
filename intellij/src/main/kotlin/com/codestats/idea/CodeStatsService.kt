package com.codestats.idea

import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.fileEditor.FileDocumentManager
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * CodeStats 应用级服务：
 * 1. 监听所有文档编辑，统计"插入的换行数"作为新增行数
 * 2. 按 (日期, 文件) 聚合，每 30 秒追加写入 ~/.codestats/daily.jsonl
 * 3. 与 VSCode 版完全相同的 JSONL 格式（ide 固定为 "idea"）
 */
@Service(Service.Level.APP)
class CodeStatsService : BulkAwareDocumentListener, Disposable {

    private val log = Logger.getInstance(CodeStatsService::class.java)
    private val pending = ConcurrentHashMap<String, Long>()

    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "codestats-flush").apply { isDaemon = true }
    }

    /** 数据文件：~/.codestats/daily.jsonl */
    val dataFile: Path = Path.of(System.getProperty("user.home"), ".codestats", "daily.jsonl")

    init {
        EditorFactory.getInstance().eventMulticaster.addDocumentListener(this, this)
        scheduler.scheduleWithFixedDelay({ flush() }, 30, 30, TimeUnit.SECONDS)
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(AppLifecycleListener.TOPIC, object : AppLifecycleListener {
                override fun appClosing() {
                    flush()
                }
            })
    }

    override fun documentChanged(event: DocumentEvent) {
        // 只统计插入的换行数：回车、粘贴多行都会 +N；单行内打字/删除不计
        val added = countNewlines(event.newFragment.toString())
        if (added == 0) return
        val virtualFile = FileDocumentManager.getInstance().getFile(event.document) ?: return
        val key = "${today()}\u0000${virtualFile.path}"
        pending.merge(key, added.toLong()) { a, b -> a + b }
        if (pending.size >= 300) flush()
    }

    /** 今日（含未落盘）总行数 */
    fun todayCount(): Long {
        val date = today()
        return pending.entries.sumOf { (k, v) -> if (k.startsWith("$date\u0000")) v else 0L }
    }

    /** 今日按文件拆分（含未落盘） */
    fun todayByFile(): List<Pair<String, Long>> {
        val date = today()
        val map = mutableMapOf<String, Long>()
        pending.forEach { (k, v) ->
            if (k.startsWith("$date\u0000")) {
                map.merge(k.substringAfter('\u0000'), v) { a, b -> a + b }
            }
        }
        fileRecords().filter { it.date == date }.forEach { map.merge(it.file, it.lines) { a, b -> a + b } }
        return map.entries.sortedByDescending { it.value }.map { it.key to it.value }
    }

    /** 本周（含今天往前 6 天）总行数 */
    fun weekTotal(): Long {
        val since = LocalDate.now().minusDays(6).toString()
        val fileSum = fileRecords().filter { it.date >= since }.sumOf { it.lines }
        val pendingSum = pending.entries.sumOf { (k, v) ->
            val date = k.substringBefore('\u0000')
            if (date >= since) v else 0L
        }
        return fileSum + pendingSum
    }

    /** 连续写代码天数（截至今天或昨天，含未落盘） */
    fun streak(): Int {
        val hasDay = mutableMapOf<String, Boolean>()
        fileRecords().forEach { hasDay[it.date] = true }
        pending.forEach { (k, _) -> hasDay[k.substringBefore('\u0000')] = true }

        var cursor = LocalDate.now()
        if (hasDay[cursor.toString()] != true) cursor = cursor.minusDays(1)
        var count = 0
        while (hasDay[cursor.toString()] == true) {
            count++
            cursor = cursor.minusDays(1)
        }
        return count
    }

    private data class FileRec(val date: String, val file: String, val lines: Long)

    private fun fileRecords(): List<FileRec> = readFileLines().mapNotNull { line ->
        runCatching {
            val date = line.substringAfter("\"date\":\"").substringBefore('"')
            val file = line.substringAfter("\"file\":\"").substringBefore('"')
            val lines = line.substringAfter("\"lines\":").substringBefore(',').toLong()
            FileRec(date, file, lines)
        }.getOrNull()
    }

    /** 落盘：把内存聚合追加写入 daily.jsonl */
    private fun flush() {
        if (pending.isEmpty()) return
        val now = System.currentTimeMillis()
        val sb = StringBuilder(pending.size * 120)
        pending.forEach { (key, count) ->
            val date = key.substringBefore('\u0000')
            val file = key.substringAfter('\u0000')
            sb.append("{\"date\":\"").append(date)
                .append("\",\"ide\":\"idea\",\"file\":\"")
                .append(escapeJson(file))
                .append("\",\"lines\":").append(count)
                .append(",\"ts\":").append(now)
                .append("}\n")
        }
        try {
            Files.createDirectories(dataFile.parent)
            Files.write(dataFile, sb.toString().toByteArray(Charsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND)
            pending.clear()
        } catch (e: Exception) {
            log.warn("[codestats] 写入失败 ${dataFile}", e)
        }
    }

    private fun readFileLines(): List<String> =
        try {
            if (Files.exists(dataFile)) Files.readAllLines(dataFile, Charsets.UTF_8) else emptyList()
        } catch (e: Exception) {
            log.warn("[codestats] 读取失败 ${dataFile}", e)
            emptyList()
        }

    private fun today(): String = LocalDate.now().toString()

    private fun countNewlines(text: String): Int = text.count { it == '\n' }

    private fun escapeJson(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"")

    override fun dispose() {
        scheduler.shutdownNow()
        flush()
    }

    companion object {
        fun getInstance(): CodeStatsService =
            ApplicationManager.getApplication().getService(CodeStatsService::class.java)
    }
}
