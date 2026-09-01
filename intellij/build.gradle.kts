plugins {
    id("java")
    kotlin("jvm") version "2.4.10"
    // IntelliJ Platform Gradle Plugin 2.x（支持 2024.2+ 平台，修复 1.x 的兼容性问题）
    id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = "com.codestats"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // 用本机已安装的 IDEA 作为 SDK；换机器时改成你自己的路径，或改用 ideaIC("2024.1.2") 下载版
        local("D:/IDEA2026/IntelliJ IDEA 2026.2.0.1")
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

intellijPlatform {
    buildSearchableOptions = false
    // 纯 Kotlin 插件无需字节码插桩
    instrumentCode = false
    pluginConfiguration {
        version = "0.1.0"
    }
}
