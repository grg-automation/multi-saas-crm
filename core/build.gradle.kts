plugins {
    kotlin("jvm") version "1.9.25"
    kotlin("plugin.spring") version "1.9.25"
    id("org.springframework.boot") version "3.5.3"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("plugin.jpa") version "1.9.25"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // ✅ NEW - HTTP Client for external API calls
    implementation("org.springframework.boot:spring-boot-starter-webflux")

    // ✅ NEW - Retry logic (added based on your comment)
    implementation("org.springframework.retry:spring-retry")

    // ✅ NEW - JSON Processing (Enhanced)
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.1") // Explicit version for stability
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.17.1")

    // ✅ NEW - File Upload/Storage
    implementation("commons-io:commons-io:2.11.0")
    implementation("org.apache.tika:tika-core:2.9.1") // For MIME type detection

    // ✅ NEW - AWS SDK (if using S3 for file storage)
    implementation("software.amazon.awssdk:s3:2.21.29")
    implementation("software.amazon.awssdk:core:2.21.29")

    // ✅ NEW - Image Processing (for thumbnails)
    implementation("org.imgscalr:imgscalr-lib:4.2")

    // ✅ NEW - Scheduling and Async Processing
    implementation("org.springframework.boot:spring-boot-starter-quartz")

    // ✅ NEW - Rate Limiting
    implementation("com.github.vladimir-bukhtoyarov:bucket4j-core:7.6.0")
    implementation("com.github.vladimir-bukhtoyarov:bucket4j-redis:7.6.0")

    // ✅ NEW - Monitoring and Metrics
    implementation("io.micrometer:micrometer-registry-prometheus")

    // ✅ NEW - Telegram Bot API Client (Optional - or use direct HTTP calls)
    implementation("org.telegram:telegrambots:6.8.0")
    implementation("org.telegram:telegrambots-spring-boot-starter:6.8.0")

    // ✅ NEW - WhatsApp/Twilio Client (Optional)
    implementation("com.twilio.sdk:twilio:9.14.1")

    // ✅ NEW - OpenAI Integration (Optional)
    implementation("com.theokanning.openai-gpt3-java:service:0.18.2")

    // ✅ EXISTING - Database and others
    runtimeOnly("org.postgresql:postgresql")

    // ✅ EXISTING - Testing
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

allOpen {
    annotation("jakarta.persistence.Entity")
    annotation("jakarta.persistence.MappedSuperclass")
    annotation("jakarta.persistence.Embeddable")
}

tasks.withType<Test> {
    useJUnitPlatform()
}
