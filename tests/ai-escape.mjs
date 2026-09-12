import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();let reference;
try{for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch();try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const results=[];
 for(const scenario of ['escape-tangent','escape-outward'])for(let seed=0;seed<3;seed++){
  const run=await page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),{scenario,policy:'current',seed:`ai-bench:${seed}`});
  assert(run.result.alive,`${engine.name()}: ${scenario}/${seed} died`);results.push(run);
 }
 const state=await page.evaluate(async()=>{
  const {Game}=await import('/src/Game.ts');const {massFromRadius}=await import('/src/mass.ts');
  const {shotChargeAt}=await import('/src/shots.ts');const {firstDifference,replaySchema}=await import('/src/replay.ts');
  const game=new Game(document.createElement('canvas'));game.start([{id:0,isLocal:true}],'charge-check',{bodyCount:0,aiCount:1,arenaShrinks:false,gravity:0,chargeMs:1500});
  const ai=game.blackHoles.find(b=>b.type==='ai'),predator=game.blackHoles.find(b=>b.type==='player');
  ai.position={x:0,y:0};ai.velocity={x:0,y:10};predator.position={x:500,y:0};predator.radius=240;predator.mass=massFromRadius(240);
  const initial=game.getFrozenSnapshot(),shots=[];const original=game.expulse.bind(game);
  game.expulse=(body,direction,radiation,charge=0)=>{if(body.type==='ai'&&!radiation){if(charge>shotChargeAt(body.aiChargeTicks*1000/60,game.settings))throw Error('AI fired before charge was earned');shots.push(charge);}original(body,direction,radiation,charge);};
  const run=()=>{for(let tick=1;tick<=240;tick++)game.tick(new Map(),tick);return game.getFrozenSnapshot();};
  const final=run();if(!shots.some(charge=>charge>0))throw Error('AI never used a charged shot');
  game.rollbackToSnapshot(initial);const repeated=run();if(JSON.stringify(final)!==JSON.stringify(repeated))throw Error('Charge state drifted after rollback');
  if(!replaySchema.safeParse({version:23,seed:'charge',browser:'test',inputs:[],states:[final]}).success)throw Error('Replay rejected AI charge');
  const altered=structuredClone(final);altered.find(b=>b.type==='ai').aiChargeTicks=999;
  if(!firstDifference(final,altered))throw Error('Desync detector ignored AI charge');
  game.destroy();return {final,shots};
 });
 results.push(state);if(reference)assert.deepEqual(results,reference,'Escape/charging differs across browsers');else reference=results;
 console.log(`PASS ${engine.name()}: momentum escape, earned charge, replay state, exact rollback`);
}finally{await browser.close();}}}finally{await server.close();}
