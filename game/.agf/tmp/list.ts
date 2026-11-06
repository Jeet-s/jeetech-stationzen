import { SPECS, LEVELS } from "../../src/game/levels";
import pt from "../playtest.json";
const P = pt as any;
SPECS.forEach((s, i) => {
  const L = LEVELS[i];
  console.log(`L${i+1} [${s.role}] ${s.name} | st${L.stations.length} cor${L.corridors.length} wk${s.weeks} lines${s.lines} tr${s.tracks.join("/")}${s.cards?" cards "+JSON.stringify(s.cards):""}${s.cars?" cars"+s.cars:""}${s.hubs?" hubs"+s.hubs:""} | c${P.personas.casual[i]} s${P.personas.skilled[i]} | ${s.aha.slice(0,150)}`);
});
