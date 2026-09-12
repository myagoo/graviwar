import {readFile} from 'node:fs/promises';
const manualGenome=JSON.parse(await readFile('tests/fixtures/ai-manual-genome.json','utf8'));
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();let reference;
try{for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch();try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async()=>{
  const {aiDecision:decide}=await import('/src/ai.ts');
        const {default:manualGenome}=await import('/tests/fixtures/ai-manual-genome.json');
        // Keep tactical expectations for the manual profile; real Game ticks use live weights.
        const aiDecision=(self,bodies,arena,settings)=>decide(self,bodies,arena,settings,manualGenome);const {massFromRadius}=await import('/src/mass.ts');const {DEFAULT_MULTIPLAYER_SETTINGS:settings}=await import('/src/solo-settings.ts');
  const body=(radius,x)=>({type:'cpu',radius,mass:massFromRadius(radius),position:{x,y:0},velocity:{x:0,y:0}});
  const self={...body(155,0),type:'ai',playerId:'ai',aiChargeTicks:60};
  const incoming=body(80,650);self.velocity.x=20;
  if(aiDecision(self,[self,incoming],10000).clickDirection!==undefined)throw Error('Braked into free incoming food');
  self.velocity.x=0;incoming.velocity.x=-10;
  const distantMeal=body(142,-2500);
  if(aiDecision(self,[self,incoming,distantMeal],10000).clickDirection!==undefined)throw Error('Ignored an incoming meal while targeting another');
  self.velocity.x=20;incoming.velocity={x:0,y:20};
  if(aiDecision(self,[self,incoming],10000).clickDirection===undefined)throw Error('Coasted for food that will miss');
  self.velocity.x=0;incoming.velocity={x:-10,y:0};
  const danger=body(240,-450);
  if(aiDecision(self,[self,incoming,danger],10000).clickDirection===undefined)throw Error('Free food suppressed an emergency escape');
  self.position.x=9500;self.velocity.x=20;incoming.position.x=9900;incoming.velocity.x=0;
  if(aiDecision(self,[self,incoming],10000).clickDirection===undefined)throw Error('Free food suppressed border avoidance');
  self.position.x=0;self.velocity.x=0;
  const reward=body(142,2500),scrap=body(35,-500);reward.velocity.y=2;
  const hunt=aiDecision(self,[self,reward,scrap],10000);
  if(hunt.clickDirection===undefined||Math.cos(hunt.clickDirection)>=0)throw Error('Ignored near-equal reward in favor of scraps or idling');
  const almostEqual=body(154,1000);self.storedBonus='pulse';
  const conserve=aiDecision(self,[self,almostEqual],10000);
  if(conserve.clickDirection!==undefined||conserve.activateBonus)throw Error('Wasted size advantage or treated edible prey as predator');
  const costly=body(148,2500);delete self.storedBonus;
  if(aiDecision(self,[self,costly],10000,{...settings,shotMass:0.15}).clickDirection!==undefined)throw Error('Ignored custom shot cost when checking size advantage');
 });
 const runs=[];
 for(let seed=20;seed<25;seed++)runs.push(await page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),{scenario:'valuable-chase',policy:'current',seed:`ai-bench:${seed}`,genome:manualGenome}));
 assert(runs.every(r=>r.result.alive),'Hunting killed the AI');
 assert(runs.reduce((sum,r)=>sum+r.result.massRatio,0)/runs.length>1.3,'High-reward pursuit lost its growth advantage');
 if(reference)assert.deepEqual(runs,reference,'Hunting drifted between browsers');else reference=runs;
 console.log(`PASS ${engine.name()}: manual-profile prey selection, size budget, growth, exact cross-browser states`);
}finally{await browser.close();}}}finally{await server.close();}
