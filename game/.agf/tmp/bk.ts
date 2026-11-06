import { backupCode, readBackup } from "../../src/game/collections";
const p: any = { level: 14, coins: 345, hints: 2, breathers: 1, stars: { "1": 3, "2": 2, "5": 1 }, garden: ["halt", "tram"], adsRemoved: false };
const c = backupCode(p); console.log(c, JSON.stringify(readBackup(c)), readBackup(c.replace("SZ1-E", "SZ1-F")));
