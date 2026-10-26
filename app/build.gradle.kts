plugins {
    id("com.android.application")
}

android {
    namespace = "com.signals.dashboard"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.signals.dashboard"
        minSdk = 24
        targetSdk = 34
        versionCode = 7
        versionName = "7.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // signed with the standard debug key so the APK installs directly (sideload)
            signingConfig = signingConfigs.getByName("debug")
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
