#!/usr/bin/env bash
# Construit un APK Android WebView « Inventaire All Vap's » téléchargeable.
# Ne touche PAS au tunnel Cloudflare.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FIXED_URL="$(tr -d '[:space:]' < data/FIXED_TUNNEL_URL.txt)"
HOST="${FIXED_URL#https://}"
HOST="${HOST#http://}"
HOST="${HOST%%/*}"
START_URL="${FIXED_URL}/inventaire"

OUT_DIR="$ROOT/public/apps"
WORKDIR="$ROOT/mobile/inventaire-webview"
mkdir -p "$OUT_DIR" "$WORKDIR"

echo "URL app: $START_URL"

# Structure projet Android minimal (WebView plein écran)
APP="$WORKDIR/app"
mkdir -p "$APP/src/main/java/fr/allvaps/inventaire"
mkdir -p "$APP/src/main/res/layout"
mkdir -p "$APP/src/main/res/values"
mkdir -p "$APP/src/main/res/mipmap-hdpi"
mkdir -p "$APP/src/main/res/xml"

# Icône depuis icon-192
if command -v convert >/dev/null 2>&1; then
  convert "$ROOT/public/icon-192.png" -resize 72x72 "$APP/src/main/res/mipmap-hdpi/ic_launcher.png"
else
  cp "$ROOT/public/icon-192.png" "$APP/src/main/res/mipmap-hdpi/ic_launcher.png"
fi

cat > "$WORKDIR/settings.gradle" <<'EOF'
rootProject.name = "AllVapsInventaire"
include ':app'
EOF

cat > "$WORKDIR/build.gradle" <<'EOF'
buildscript {
  repositories { google(); mavenCentral() }
  dependencies { classpath 'com.android.tools.build:gradle:8.2.2' }
}
allprojects {
  repositories { google(); mavenCentral() }
}
EOF

cat > "$WORKDIR/gradle.properties" <<'EOF'
org.gradle.jvmargs=-Xmx2g
android.useAndroidX=true
EOF

cat > "$APP/build.gradle" <<EOF
plugins { id 'com.android.application' }
android {
  namespace 'fr.allvaps.inventaire'
  compileSdk 34
  defaultConfig {
    applicationId "fr.allvaps.inventaire"
    minSdk 24
    targetSdk 34
    versionCode 3
    versionName "1.0.2"
  }
  buildTypes {
    release {
      minifyEnabled false
    }
  }
  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }
}
EOF

cat > "$APP/src/main/AndroidManifest.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.FLASHLIGHT" />
  <uses-feature android:name="android.hardware.camera" android:required="false" />
  <application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:usesCleartextTraffic="false"
    android:hardwareAccelerated="true"
    android:theme="@style/Theme.AllVaps">
    <activity
      android:name=".MainActivity"
      android:exported="true"
      android:configChanges="orientation|screenSize|keyboardHidden"
      android:screenOrientation="portrait"
      android:windowSoftInputMode="adjustResize">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
EOF

cat > "$APP/src/main/res/values/strings.xml" <<'EOF'
<resources>
  <string name="app_name">Inventaire All Vap\'s</string>
</resources>
EOF

cat > "$APP/src/main/res/values/themes.xml" <<'EOF'
<resources>
  <style name="Theme.AllVaps" parent="android:Theme.Material.Light.NoActionBar">
    <item name="android:statusBarColor">#047857</item>
    <item name="android:navigationBarColor">#047857</item>
    <item name="android:windowBackground">#FFFFFF</item>
  </style>
</resources>
EOF

cat > "$APP/src/main/res/layout/activity_main.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent">
  <WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
</FrameLayout>
EOF

cat > "$APP/src/main/java/fr/allvaps/inventaire/MainActivity.java" <<EOF
package fr.allvaps.inventaire;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowManager;

public class MainActivity extends Activity {
  private WebView webView;
  private static final String START_URL = "$START_URL";

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
    );
    setContentView(R.layout.activity_main);
    webView = findViewById(R.id.webview);
    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    webView.setWebViewClient(new WebViewClient());
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(() -> request.grant(request.getResources()));
      }
    });
    webView.loadUrl(START_URL);
  }

  @Override
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) webView.goBack();
    else super.onBackPressed();
  }
}
EOF

# Gradle wrapper
if [ ! -f "$WORKDIR/gradlew" ]; then
  if [ ! -d /tmp/gradle-8.7 ]; then
    curl -sL https://services.gradle.org/distributions/gradle-8.7-bin.zip -o /tmp/gradle-8.7-bin.zip
    unzip -q /tmp/gradle-8.7-bin.zip -d /tmp
  fi
  /tmp/gradle-8.7/bin/gradle -p "$WORKDIR" wrapper --gradle-version 8.7
fi

# Android SDK commandline tools
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
mkdir -p "$ANDROID_HOME/cmdline-tools"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Téléchargement Android cmdline-tools…"
  curl -sL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdtools.zip
  rm -rf /tmp/cmdline-tools
  unzip -q /tmp/cmdtools.zip -d /tmp/cmdline-tools
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mkdir -p "$ANDROID_HOME/cmdline-tools/latest"
  # zip contains cmdline-tools/*
  if [ -d /tmp/cmdline-tools/cmdline-tools ]; then
    mv /tmp/cmdline-tools/cmdline-tools/* "$ANDROID_HOME/cmdline-tools/latest/"
  else
    mv /tmp/cmdline-tools/* "$ANDROID_HOME/cmdline-tools/latest/" 2>/dev/null || true
  fi
fi

yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" \
  "platform-tools" "platforms;android-34" "build-tools;34.0.0" >/tmp/sdkmanager.log 2>&1 || true

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$WORKDIR"
chmod +x gradlew
./gradlew assembleRelease --no-daemon 2>&1 | tee /tmp/apk-build.log | tail -40

APK_SRC=$(find "$WORKDIR" -name '*-release-unsigned.apk' -o -name 'app-release.apk' 2>/dev/null | head -1)
if [ -z "$APK_SRC" ]; then
  APK_SRC=$(find "$WORKDIR" -name '*.apk' 2>/dev/null | head -1)
fi
if [ -z "$APK_SRC" ]; then
  echo "APK introuvable" >&2
  tail -60 /tmp/apk-build.log >&2
  exit 1
fi

# Signer (debug keystore auto)
KS=/tmp/allvaps-inventaire.keystore
if [ ! -f "$KS" ]; then
  keytool -genkeypair -v -keystore "$KS" -alias allvaps -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass allvaps123 -keypass allvaps123 -dname "CN=All Vaps Inventaire,O=All Vaps,C=FR"
fi

ALIGNED=/tmp/allvaps-aligned.apk
SIGNED="$OUT_DIR/AllVaps-Inventaire.apk"
"$ANDROID_HOME/build-tools/34.0.0/zipalign" -f 4 "$APK_SRC" "$ALIGNED"
"$ANDROID_HOME/build-tools/34.0.0/apksigner" sign --ks "$KS" --ks-key-alias allvaps \
  --ks-pass pass:allvaps123 --key-pass pass:allvaps123 --out "$SIGNED" "$ALIGNED"

ls -lh "$SIGNED"
echo "OK $SIGNED → /apps/AllVaps-Inventaire.apk"
echo "startUrl=$START_URL"
