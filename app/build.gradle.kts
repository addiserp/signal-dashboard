plugins {
    id("com.android.application")
}

android {
    namespace = "com.signals.dashboard"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.addiserp.signals"
        minSdk = 24
        targetSdk = 34
        versionCode = 28
        versionName = "28.0"
    }

    // Permanent release key from GitHub secrets (see SIGNING.md). Without it the build falls back to
    // a temporary debug key, which means phones must uninstall the app before every update.
    val releaseKeystore = System.getenv("ANDROID_KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.exists() }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseKeystore != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
