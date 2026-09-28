# Install Hanuman Disha on your iQOO Z9 (free, no Play Store)

You do NOT need Android Studio, Flutter or coding. GitHub builds the app for you.

## PART 1 — Build the app on GitHub (about 10 minutes)

1. Open your repo: `github.com/kothakula-sagar/Hanuman-diksha`
2. **Upload everything from this folder** to the repo (replace old files).
   - Easiest: click **Add file → Upload files**, drag ALL files and folders in,
     and make sure the hidden folder `.github` (with `workflows/build-apk.yml` inside) is included.
   - If your computer hides the `.github` folder, turn on "Show hidden files" first.
   - Click **Commit changes**.
3. Click the **Actions** tab at the top of the repo.
   - If it asks to enable workflows, click the green button.
4. Click **Build Android APK** on the left, then **Run workflow → Run workflow**.
5. Wait 5–10 minutes until you see a green tick ✅.
6. Click the finished run, scroll to **Artifacts**, and download **Hanuman-Disha-APK**
   (it downloads as a .zip — unzip it to get `app-debug.apk`).

If you see a red ❌ instead: open the run, copy the red error text, and send it to me.

## PART 2 — Install on your iQOO Z9

1. Send `app-debug.apk` to your phone (WhatsApp to yourself, Telegram, Google Drive, or USB cable).
2. Open the file on your phone. When Android asks, tap **Settings → Allow from this source**, then go back and tap **Install**.
3. If iQOO/Google Play Protect shows a warning, tap **Install anyway** / **More details → Install anyway**.
   This is normal for apps you build yourself.
4. Open **Hanuman Disha** and sign in with the same email as your website (your data is the same).

## PART 3 — Make reminders reliable on iQOO (do this once, very important)

iQOO's Funtouch OS kills background apps aggressively. Without these steps, reminders can be late or missing.

1. Long-press the app icon → **App info** → **Notifications** → turn everything **ON**.
2. **App info → Battery** → choose **Allow background activity** / **No restrictions**.
3. Settings → **Battery → Background power consumption management** → find Hanuman Disha → **Allow high background power consumption**.
4. Open Recent apps, long-press/pull down the Hanuman Disha card → tap the **Lock** icon 🔒.
5. Inside the app: **Settings → Phone reminders → Allow exact alarms** → switch it ON.
6. Tap **Send test reminder (1 min)**, lock your phone, and wait one minute. You should get a notification.
   If it does not arrive, repeat steps 2–4.

## Updating the app later
Change files on GitHub → Actions → Run workflow → download the new APK → install over the old one
(your data stays safe because it lives in Firebase).

## Good to know
- Reminders are scheduled ON your phone, so they work with no internet and with the app closed.
- Reminders are rebuilt whenever you open the app, so edit times inside the app and they update.
- The app is signed with a "debug" key. That is fine for personal use, but an APK from a different
  build may need you to uninstall the old one first.
