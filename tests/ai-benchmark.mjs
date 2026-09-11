import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const output=process.env.AI_BENCH_OUT??'.scratch/ai-benchmark';
const seedCount=Number(process.env.AI_BENCH_SEEDS??3);
const seedStart=Number(process.env.AI_BENCH_SEED_START??0);
assert(Number.isInteger(seedStart)&&seedStart>=0,'AI_BENCH_SEED_START must be a nonnegative integer');
const decisionPath=process.env.AI_BENCH_DECISION_MODULE??'/src/ai.ts';
const opponentPath=process.env.AI_BENCH_OPPONENT_MODULE??'/tests/fixtures/ai-baseline-policy.ts';
const scenarios=(process.env.AI_BENCH_SCENARIOS??'feeding,coasting,moving,guarded,shrinking,match').split(',');
assert(scenarios.length>0&&scenarios.every(name=>['feeding','coasting','moving','guarded','shrinking','match','escape-tangent','escape-headon','escape-outward','valuable-prey','valuable-chase'].includes(name)),'Unknown benchmark scenario');
assert(Number.isInteger(seedCount)&&seedCount>0&&seedCount<=100,'AI_BENCH_SEEDS must be 1–100');
await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
const rows=[],worst=[];
const run=(page,options)=>page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),options);
try{
 // Browser equivalence is separate from gameplay quality: exact states, not rounded metrics.
 for(const scenario of ['coasting','guarded']){
  let reference;
  for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch();try{const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);const state=await run(page,{scenario,policy:'current',seed:'determinism',seconds:10,decisionPath,opponentPath});if(reference)assert.deepEqual(state,reference);else reference=state;}finally{await browser.close();}}
 }
 console.log('PASS exact Chromium/Firefox/WebKit benchmark states');
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
  for(const scenario of scenarios){
   for(let seed=seedStart;seed<seedStart+seedCount;seed++)for(let seat=0;seat<(scenario==='match'?3:1);seat++)for(const policy of ['current','passive','nearest']){
    const options={scenario,policy,seed:`ai-bench:${seed}`,seat,decisionPath,opponentPath,trace:policy==='current'};
    const {result,frames}=await run(page,options);rows.push(result);
    if(policy==='current'){const previous=worst.findIndex(run=>run.result.scenario===scenario);if(previous<0)worst.push({options,result,frames});else if(result.massRatio<worst[previous].result.massRatio)worst[previous]={options,result,frames};}
   }
   console.log(`Completed ${scenario}: ${rows.length} runs`);
  }
 }finally{await browser.close();}
}finally{await server.close();}
const mean=(items,key)=>items.reduce((sum,r)=>sum+Number(r[key]),0)/items.length;
const groups=[];
for(const scenario of [...new Set(rows.map(r=>r.scenario))])for(const policy of ['current','passive','nearest']){
 const items=rows.filter(r=>r.scenario===scenario&&r.policy===policy);
 groups.push({scenario,policy,runs:items.length,massRatio:mean(items,'massRatio'),radiusRatio:mean(items,'radiusRatio'),survival:mean(items,'alive'),expelledRatio:mean(items,'expelledRatio'),shotsPerMinute:mean(items,'shotsPerMinute'),winRate:scenario==='match'?mean(items,'win'):null,resolved:scenario==='match'?mean(items,'resolved'):null});
}
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const policyHash=createHash('sha256').update(await readFile('.'+decisionPath)).digest('hex');
await writeFile(`${output}/results.json`,JSON.stringify({version:1,commit,policyHash,seedCount,seedStart,decisionPath,opponentPath,rows,groups},null,2));
let report=`# AI benchmark\n\nSource: ${commit}. Seeds: ${seedCount}. Ratios are relative to starting size/mass; zero includes deaths.\n\n| Scenario | Policy | Runs | Final mass | Final radius | Alive | Mass expelled | Shots/min | Wins |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for(const g of groups)report+=`| ${g.scenario} | ${g.policy} | ${g.runs} | ${g.massRatio.toFixed(2)}× | ${g.radiusRatio.toFixed(2)}× | ${(g.survival*100).toFixed(0)}% | ${g.expelledRatio.toFixed(2)}× | ${g.shotsPerMinute.toFixed(1)} | ${g.winRate===null?'—':(g.winRate*100).toFixed(0)+'%'} |\n`;
if(process.env.AI_BENCH_BASELINE){const baseline=JSON.parse(await readFile(process.env.AI_BENCH_BASELINE,'utf8'));assert.equal(baseline.version,1);assert.equal(baseline.seedCount,seedCount);assert.deepEqual(baseline.rows.map(r=>[r.scenario,r.policy,r.seed,r.seat]),rows.map(r=>[r.scenario,r.policy,r.seed,r.seat]));report+='\n## Paired change from baseline\n\n';for(const g of groups.filter(g=>g.policy==='current')){const old=baseline.groups.find(r=>r.scenario===g.scenario&&r.policy===g.policy);report+=`- ${g.scenario}: mass ${(g.massRatio-old.massRatio).toFixed(3)}×; survival ${((g.survival-old.survival)*100).toFixed(1)} percentage points; shots/min ${(g.shotsPerMinute-old.shotsPerMinute).toFixed(1)}.\n`;}}
await writeFile(`${output}/report.md`,report);
await writeFile(`${output}/worst-runs.json`,JSON.stringify(worst));
// One-second snapshots are a visual diagnostic, not a tick-accurate rollback replay.
await writeFile(`${output}/viewer.html`,`<!doctype html><meta charset="utf-8"><title>AI benchmark worst runs</title><style>body{background:#000;color:#ddd;font:16px system-ui;margin:16px}canvas{display:block;width:min(80vh,100%);height:auto}input{width:100%}</style><h1>Worst AI runs</h1><select aria-label="Run" id="run"></select><button id="play">Play / pause</button><input aria-label="Time" id="time" type="range" min="0" value="0"><p id="info"></p><canvas width="800" height="800"></canvas><p>Blue: measured player · Purple: opponents · Gold: neutral bodies. One snapshot per second.</p><script>const runs=${JSON.stringify(worst).replaceAll('<','\\u003c')};const select=document.querySelector('#run'),slider=document.querySelector('#time'),ctx=document.querySelector('canvas').getContext('2d');let playing=false;runs.forEach((r,i)=>select.add(new Option(r.result.scenario+' / '+r.result.seed+' / seat '+r.result.seat,i)));function draw(){const r=runs[select.value],f=r.frames[+slider.value];slider.max=r.frames.length-1;document.querySelector('#info').textContent=(f.frame/60)+'s · final mass '+r.result.massRatio.toFixed(2)+'×';ctx.fillStyle='#000';ctx.fillRect(0,0,800,800);const extent=Math.max(100,f.arena,...f.bodies.map(b=>Math.hypot(b.position.x,b.position.y)+b.radius)),scale=380/extent;ctx.strokeStyle='#567';ctx.beginPath();ctx.arc(400,400,f.arena*scale,0,Math.PI*2);ctx.stroke();for(const b of f.bodies){ctx.strokeStyle=b.playerId===r.options.seat?'#91d8ff':b.playerId!==undefined?'#d4adff':'#ffc983';ctx.beginPath();ctx.arc(400+b.position.x*scale,400+b.position.y*scale,Math.max(1,b.radius*scale),0,Math.PI*2);ctx.stroke();}}select.onchange=()=>{slider.value=0;draw()};slider.oninput=draw;document.querySelector('#play').onclick=()=>playing=!playing;setInterval(()=>{if(playing){slider.value=(+slider.value+1)%(+slider.max+1);draw()}},250);draw();</script>`);
console.log(report);console.log(`Saved ${output}/results.json, report.md, worst-runs.json and viewer.html`);
