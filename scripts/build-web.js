// Copies the website files into ./www, which Capacitor packages inside the Android app.
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "..", "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
["index.html", "app.js", "styles.css", "firebase-config.js", "manifest.json", "sw.js", "native-notifications.js"]
  .forEach(f => { if (fs.existsSync(path.join(__dirname, "..", f))) fs.copyFileSync(path.join(__dirname, "..", f), path.join(out, f)); });
if (fs.existsSync(path.join(__dirname, "..", "icons")))
  fs.cpSync(path.join(__dirname, "..", "icons"), path.join(out, "icons"), { recursive: true });
console.log("Web files copied to www/");
