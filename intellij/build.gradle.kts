plugins {
    id("java")
    kotlin("jvm") version "2.4.10"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.codestats"
version = "0.1.0"

repositories {
    mavenCentral()
}

intellij {
    pluginName.set("codestats-idea")
    // 优先用本地已安装的 IDEA 作为 SDK（无需下载整个 IDE）；
    // 没配 intellijLocalPath 时自动下载 IC-2024.1.2。
    val local = providers.gradleProperty("intellijLocalPath").orNull?.takeIf { it.isNotBlank() }
    if (local != null) {
        localPath.set(local)
    } else {
        version.set("IC-2024.1.2")
    }
    downloadSources.set(false)
    updateSinceUntilBuild.set(true)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks {
    // 纯 Kotlin 插件无需字节码插桩；禁用可避免对 JDK 结构的要求
    named("instrumentCode") {
        enabled = false
    }
    buildSearchableOptions {
        enabled = false
    }
}
