import { SPECS } from "../../src/game/levels";
SPECS.forEach((s,i)=>{ if (s.cards) console.log(i+1, s.role, JSON.stringify(s.cards)); });
