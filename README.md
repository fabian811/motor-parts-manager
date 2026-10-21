# Motor Parts Manager

This repository contains two implementations of the Motor Parts Manager:

- `web/` is the HTML, CSS, and JavaScript offline-first web app/PWA.
- `app/` is a separate native Android app built with Kotlin and Jetpack Compose.

They are separate apps and do not share data. The web app stores data in the current browser profile; it does not sync to the Android app or a server.

## Web app

### Requirements

- A current browser.
- Python 3 to run a local development server.
- Node.js for the automated tests (no npm install is needed).

### Run locally

From the repository root:

```powershell
py -m http.server 8080 --directory .\web
```

If the `py` launcher is unavailable:

```powershell
python -m http.server 8080 --directory .\web
```

Open <http://localhost:8080>. Use `localhost` or an HTTPS host: browser features such as service workers and Web Crypto require a secure context. Create an account in the app; there is no preconfigured account or default PIN.

For web features, limitations, deployment notes, and detailed tests, see [web/README.md](./web/README.md).

### Run web tests

From the repository root:

```powershell
node --test .\web\tests\domain.test.js
node --check .\web\app.js
node --check .\web\domain.js
node --check .\web\service-worker.js
```

## Native Android app

### Requirements

- Android Studio with Android SDK Platform 37 installed.
- JDK 25 for the Gradle daemon. The Gradle wrapper and daemon JVM criteria are included in the repository; first-time setup may need internet access to download Gradle, dependencies, and the configured JDK.

### Open and run in Android Studio

1. Open this repository's root folder (`settings.gradle.kts`) in Android Studio.
2. Allow Gradle sync and install any requested Android SDK components.
3. Select the `app` run configuration and an emulator or connected Android device, then click **Run**.

### Build from a terminal

Run these commands from the repository root.

Windows PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

macOS/Linux:

```sh
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

The generated debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. A previously built debug APK is also provided as `app-debug.apk` in the repository root. It is for testing, not a signed production release.

## Repository contents

- `app/` — Android application source and resources.
- `web/` — web app, PWA assets, documentation, and domain tests.
- `gradle/`, `gradlew`, `gradlew.bat` — Gradle wrapper and build configuration.
- `app-debug.apk` — optional prebuilt debug APK.

Generated Gradle/build output, IDE caches, and machine-specific `local.properties` are not source files and are excluded from version control. Gradle rebuilds generated output as needed.
