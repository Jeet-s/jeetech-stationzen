const { execFileSync } = require("child_process");
const ADB = process.env.HOME + "/Library/Android/sdk/platform-tools/adb";
const adb = (a) => execFileSync(ADB, a, { maxBuffer: 64 << 20 });
const fs = require("fs"); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const steps = JSON.parse(process.argv[2]);
  for (const s of steps) {
    if (s.swipe) adb(["shell", "input", "swipe", ...s.swipe.map(String), String(s.ms || 700)]);
    if (s.tap) adb(["shell", "input", "tap", ...s.tap.map(String)]);
    if (s.wait) await sleep(s.wait);
    if (s.shot) fs.writeFileSync(`${__dirname}/out/${s.shot}.png`, adb(["exec-out", "screencap", "-p"]));
  }
})();
