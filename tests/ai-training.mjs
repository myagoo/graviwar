import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
import {breed,initialPopulation,scoreMatch,validateGenome,DEFAULT_AI_GENOME} from '../scripts/ai-evolution.mjs';
const population=initialPopulation('test');
assert.equal(population.length,32);population.forEach(validateGenome);assert.deepEqual(population[0],DEFAULT_AI_GENOME);
assert.deepEqual(initialPopulation('test'),population);assert.notDeepEqual(initialPopulation('other'),population);
assert.throws(()=>validateGenome({...DEFAULT_AI_GENOME,preferredSpeed:Infinity}));assert.throws(()=>validateGenome({}));
const scores=population.map((_,i)=>i),next=breed(population,scores,'breed');
assert.deepEqual(next.slice(0,4),population.slice(28).reverse());next.forEach(validateGenome);
assert.deepEqual(next,breed(JSON.parse(JSON.stringify(population)),scores,'breed'),'Checkpoint roundtrip changes breeding');
let ranked=scoreMatch([null,5,5,1],[200,50,50,0],[10,10,10,10],10);
assert.equal(ranked[0].score,100);assert.equal(ranked[0].winner,true);assert.equal(ranked[1].rank,2.5);assert.equal(ranked[2].rank,2.5);assert.equal(ranked[3].score,0);
ranked=scoreMatch([null,null,5],[100,100,0],[10,10,10],10);
assert(ranked.every(r=>!r.winner));assert.equal(ranked[0].rank,1.5);
assert(scoreMatch([null,5],[100,50],[10,10],10)[1].growth<scoreMatch([null,5],[100,50],[10,10],5)[1].growth,'Dead time must dilute growth');
assert(scoreMatch([5,5],[0,0],[10,10],5).every(r=>r.rank===1.5&&!r.winner));
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();let reference;
try{for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch();try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const options={genomes:population,seed:'training-check',rotation:8,seconds:8,settingsOverride:{shrinkSeconds:90},snapshot:true};
 const run=()=>page.evaluate(async o=>(await import('/tests/ai-training-simulation.mjs')).trainingMatch(o),options);
 const result=await run();assert.deepEqual(await run(),result,'Seeded training is not repeatable');
 assert.equal(result.deaths.length,32);assert(result.snapshot.some(b=>b.aiTargetId),'Target commitment was not exercised');
 if(reference)assert.deepEqual(result,reference,'Experimental genomes drift across browsers');else reference=result;
 const rollback=await page.evaluate(async genome=>{
  const {Game}=await import('/src/Game.ts');const {aiDecision,AI_DECISION_TICKS}=await import('/src/ai.ts');const {firstDifference,replaySchema}=await import('/src/replay.ts');
  const players=[{id:0,isLocal:false},{id:1,isLocal:false}];const game=new Game(document.createElement('canvas'));
  try{
   game.start(players,'genome-rollback',{aiCount:0,bodyCount:20,arenaShrinks:false});
   for(const b of game.blackHoles)if(b.playerId!==undefined)b.aiChargeTicks=0;
   const step=(start,end)=>{for(let frame=start;frame<=end;frame++){const inputs=new Map();if(frame%AI_DECISION_TICKS===0)for(const p of players){const b=game.blackHoles.find(b=>b.playerId===p.id);if(b)inputs.set(p,aiDecision(b,game.blackHoles,game.arenaRadiusAt(frame+60),game.settings,genome));}game.tick(inputs,frame);}};
   step(1,120);const saved=game.getFrozenSnapshot();step(121,240);const final=game.getFrozenSnapshot();game.rollbackToSnapshot(saved);step(121,240);
   if(firstDifference(final,game.getFrozenSnapshot()))throw Error('Genome state failed rollback');
   if(!replaySchema.safeParse({version:24,seed:'test',browser:'test',inputs:[],states:[final]}).success)throw Error('Genome state rejected by replay');
   const changed=structuredClone(final);changed[0].aiTargetId='different';if(!firstDifference(final,changed))throw Error('Desync check ignores target');
   return final;
  }finally{game.destroy();}
 },population[1]);
 assert(rollback.length>0);console.log(`PASS ${engine.name()}: 32 genomes, reproducibility, target-state rollback`);
}finally{await browser.close();}}}finally{await server.close();}
console.log('PASS fitness ties, dead-time growth, bounded breeding and checkpoint roundtrip');
