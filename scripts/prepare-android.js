// Runs after `cap add android`: installs launcher icons, the notification icon, and needed permissions.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const res = path.join(root, "android", "app", "src", "main", "res");
const manifestPath = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");

// ---- 1) Notification small icon (white silhouette) ----
const stat = path.join(root, "assets", "ic_stat_icon.png");
for (const d of ["drawable", "drawable-mdpi", "drawable-hdpi", "drawable-xhdpi", "drawable-xxhdpi", "drawable-xxxhdpi"]) {
  fs.mkdirSync(path.join(res, d), { recursive: true });
  fs.copyFileSync(stat, path.join(res, d, "ic_stat_icon.png"));
}

// ---- 2) Launcher icons: replace default mipmaps with the gada icon ----
const sizes = { "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192 };
let sharp = null; try { sharp = require("sharp"); } catch {}
const src = path.join(root, "assets", "icon.png");
(async () => {
  if (sharp) {
    for (const [dir, px] of Object.entries(sizes)) {
      for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        const p = path.join(res, dir, name);
        if (fs.existsSync(p) || name !== "ic_launcher_foreground.png")
          await sharp(src).resize(px, px).png().toFile(p);
      }
    }
    // Remove adaptive-icon XML so Android uses the plain PNG icons above
    const any = path.join(res, "mipmap-anydpi-v26");
    if (fs.existsSync(any)) fs.rmSync(any, { recursive: true, force: true });
    console.log("Launcher icons replaced.");
  } else {
    console.warn("sharp not installed; keeping default launcher icon.");
  }

  // ---- 3) Manifest: permissions for notifications on Android 13+/14+ ----
  let m = fs.readFileSync(manifestPath, "utf8");
  const perms = [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.SCHEDULE_EXACT_ALARM",
    "android.permission.USE_EXACT_ALARM",
    "android.permission.RECEIVE_BOOT_COMPLETED",
    "android.permission.WAKE_LOCK",
    "android.permission.VIBRATE",
  ];
  const add = perms.filter(p => !m.includes(p)).map(p => `    <uses-permission android:name="${p}" />`).join("\n");
  if (add) m = m.replace("</manifest>", add + "\n</manifest>");
  fs.writeFileSync(manifestPath, m);
  console.log("Manifest permissions ensured.");
})();
