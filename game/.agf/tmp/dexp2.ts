import { readFileSync } from "fs";
import { LEVELS } from "../../src/game/levels";
import { mechanicsOf } from "../../src/game/describe";
import { SOLUTIONS } from "../../src/game/solutions";
const rows = readFileSync(".agf/tmp/val2.out","utf8").split("\n").filter(l=>/^L\d+ /.test(l)).map(l=>({p:Number(/search (\d+)%/.exec(l)![1])/100, c:Number(/casual (\d+)%/.exec(l)![1])/100}));
function stats(d:number[]){const n=d.length,k=Math.round(n*.2);const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;const idx=d.map((v,i)=>[v,i] as const).sort((x,y)=>x[0]-y[0]);const r=Array(n).fill(0);idx.forEach(([,i],p)=>r[i]=p);const dsq=r.reduce((a,y,i)=>a+(i-y)**2,0);return `ratio ${(mean(d.slice(n-k))/mean(d.slice(0,k))).toFixed(2)} rho ${(1-6*dsq/(n*(n*n-1))).toFixed(3)}`}
const me=(i:number)=>mechanicsOf(LEVELS[i],true).length, mv=(i:number)=>SOLUTIONS[String(i+1)]?.moves.length??1, st=(i:number)=>LEVELS[i].stations.length;
const C=(i:number)=>-Math.log(Math.max(.01,rows[i].c)), P=(i:number)=>-Math.log(Math.max(.006,rows[i].p));
const f=(name:string,g:(i:number)=>number)=>console.log(name.padEnd(30),stats(LEVELS.map((_,i)=>g(i))));
f("cur",i=>me(i)*Math.sqrt(mv(i))*(C(i)+.5*P(i)+.05));
f("me*sqrt(mv)*(C+.25P+.05)",i=>me(i)*Math.sqrt(mv(i))*(C(i)+.25*P(i)+.05));
f("me*sqrt(mv)*(C+.5P+.15)",i=>me(i)*Math.sqrt(mv(i))*(C(i)+.5*P(i)+.15));
f("me*sqrt(mv*st)*(C+.5P+.05)",i=>me(i)*Math.sqrt(mv(i)*st(i))*(C(i)+.5*P(i)+.05));
f("me^1.5*sqrt(mv)*(C+.5P+.05)",i=>me(i)**1.5*Math.sqrt(mv(i))*(C(i)+.5*P(i)+.05));
f("me*sqrt(mv)*(C+.5P+.3)",i=>me(i)*Math.sqrt(mv(i))*(C(i)+.5*P(i)+.3));
f("me*sqrt(mv*wk)*(C+.5P+.1)",i=>me(i)*Math.sqrt(mv(i)*LEVELS[i].spec.weeks)*(C(i)+.5*P(i)+.1));
