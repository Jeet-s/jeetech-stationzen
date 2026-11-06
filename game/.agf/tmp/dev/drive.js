// Device check: replay QA level touches exactly like lib/qa/device.ts levelReplay, flag silent moves (same metric).
const { execFileSync } = require("child_process");
const fs = require("fs");
const sharp = require("/Users/jagjeetsingh/ai-game-factory/node_modules/sharp");
const ADB = process.env.HOME + "/Library/Android/sdk/platform-tools/adb";
const PKG = "com.jeetech.stationzen", SCHEME = "station-zen-calm-metro-builder";
const OUT = __dirname + "/out";
const adb = (a, o = {}) => execFileSync(ADB, a, { maxBuffer: 64 << 20, ...o });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = () => adb(["exec-out", "screencap", "-p"]);
function events() {
  const log = adb(["logcat", "-d", "-s", "ReactNativeJS:*"]).toString();
  const out = [];
  for (const m of log.matchAll(/\[agf-event\] (\{.*\})/g)) { try { out.push(JSON.parse(m[1])); } catch {} }
  return out;
}
async function sameAround(a, b, at) {
  const { width = 1080, height = 2400 } = await sharp(a).metadata();
  const side = Math.round(width * 0.3);
  const left = Math.max(0, Math.min(width - side, Math.round(at.x - side / 2)));
  const top = Math.max(0, Math.min(height - side, Math.round(at.y - side / 2)));
  const crop = (x) => sharp(x).extract({ left, top, width: side, height: side }).greyscale().resize(96, 96, { fit: "fill" }).raw().toBuffer();
  const [ca, cb] = await Promise.all([crop(a), crop(b)]);
  let c = 0; for (let i = 0; i < ca.length; i++) if (Math.abs(ca[i] - cb[i]) > 40) c++;
  return c / ca.length;
}
async function main() {
  const mode = process.argv[2];
  if (mode === "install") {
    try { adb(["uninstall", PKG]); } catch {}
    console.log(adb(["install", __dirname + "/test.apk"]).toString());
    return;
  }
  if (mode === "uninstall") { try { console.log(adb(["uninstall", PKG]).toString()); } catch (e) { console.log(String(e)); } return; }
  if (mode === "shot") { // shot <url> <name> <waitMs> [taps json]
    adb(["shell", "am", "force-stop", PKG]);
    if (process.env.CLEAR) adb(["shell", "pm", "clear", PKG]);
    adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", process.argv[3], PKG]);
    await sleep(Number(process.argv[5] || 6000));
    const steps = JSON.parse(process.argv[6] || "[]");
    let k = 0;
    for (const s of steps) {
      if (s.swipe) adb(["shell", "input", "swipe", ...s.swipe.map(String), String(s.ms || 600)]);
      if (s.tap) adb(["shell", "input", "tap", ...s.tap.map(String)]);
      if (s.wait) await sleep(s.wait);
      if (s.shot) fs.writeFileSync(`${OUT}/${process.argv[4]}_${s.shot}.png`, cap());
      k++;
    }
    fs.writeFileSync(`${OUT}/${process.argv[4]}.png`, cap());
    console.log(adb(["shell", "dumpsys", "activity", "activities"]).toString().match(/ResumedActivity.*/)?.[0]);
    return;
  }
  const levels = process.argv.slice(3).map(Number);
  const cur = /cur=(\d+)x(\d+)/.exec(adb(["shell", "dumpsys", "window", "displays"]).toString());
  const w = Number(cur[1]), h = Number(cur[2]);
  for (const level of levels) {
    adb(["shell", "am", "force-stop", PKG]);
    adb(["logcat", "-c"]);
    adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `${SCHEME}://qa/level/${level}`, PKG]);
    let ev = events();
    const nexts = (e) => e.filter((x) => x.e === "qa_next" && Number(x.level) === level);
    for (let i = 0; i < 15 && !nexts(ev).length; i++) { await sleep(1000); ev = events(); }
    let moves = 0, won = false, note = "";
    const res = [];
    for (let step = 0; step < 40; step++) {
      const list = nexts(ev); const c = list[list.length - 1];
      if (!c) { note = "no qa_next"; break; }
      if (ev.some((e) => e.e === "level_complete")) { won = true; break; }
      if (c.done) { for (let i = 0; i < 5 && !ev.some((e) => e.e === "level_complete"); i++) { await sleep(1000); ev = events(); } won = ev.some((e) => e.e === "level_complete"); break; }
      const x = Math.round(c.x * w), y = Math.round(c.y * h);
      const before = cap();
      const m0 = ev.filter((e) => e.e === "move").length;
      if (c.x2 != null) adb(["shell", "input", "swipe", String(x), String(y), String(Math.round(c.x2 * w)), String(Math.round(c.y2 * h)), "220"]);
      else adb(["shell", "input", "swipe", String(x), String(y), String(x), String(y), "90"]);
      let acc = false;
      for (let i = 0; i < 8 && !acc; i++) { await sleep(400); ev = events(); acc = nexts(ev).length > list.length || ev.some((e) => e.e === "level_complete"); }
      if (!acc) { note = `not accepted after ${moves}`; fs.writeFileSync(`${OUT}/L${level}_rej${moves + 1}.png`, cap()); break; }
      moves++;
      await sleep(700);
      const after = cap();
      if (ev.filter((e) => e.e === "move").length > m0) {
        const f = await sameAround(before, after, { x, y });
        res.push(`m${moves}:${(f * 100).toFixed(1)}%`);
        if (f < 0.015) fs.writeFileSync(`${OUT}/L${level}_silent${moves}.png`, after);
        if (moves <= 2 || [5, 4, 3].includes(moves)) fs.writeFileSync(`${OUT}/L${level}_m${moves}.png`, after);
      }
      ev = events();
    }
    console.log(`L${level}: won=${won} moves=${moves} ${note} crop-change: ${res.join(" ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
