# Permanent signing key for the Android app

Android only installs an update over the old app when both are signed with the **same key**. Until now every GitHub build used a new temporary key, so you had to uninstall first. With a permanent key, updates install directly and keep your settings.

## Setup (once)

You received two private files: `addiserp-signals.jks` (the key) and `SIGNING-KEY-SECRETS.txt` (its passwords). **Never upload them to this repository** — it is public.

1. Open **Settings → Secrets and variables → Actions → Repository secrets → New repository secret** and add the four secrets listed in `SIGNING-KEY-SECRETS.txt`:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`.
2. Run **Actions → Build Android APK → Run workflow**. The log line "Signing with your permanent release key" confirms it.
3. On each phone, **uninstall the old app one last time**, then install the new APK. From now on, new versions install over it.

Keep the two files somewhere safe (e.g. a password manager or a private cloud folder). If the key is lost, a new one can be made, but every phone will need one more uninstall.
