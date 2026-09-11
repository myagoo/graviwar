import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
let reference;
try {for(const engine of [chromium,firefox,webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const result=await page.evaluate(async()=>{
   const {Game,shotChargeAt}=await import('/src/Game.ts');
   const {DEFAULT_MULTIPLAYER_SETTINGS:defaults,soloSettingsSchema,settingsSections,numericSettings}=await import('/src/solo-settings.ts');
   const {activateBonus,transferPickup}=await import('/src/bonuses.ts');
   const {massFromRadius,radiusScale}=await import('/src/mass.ts');
   const {spawnFluctuations}=await import('/src/fluctuations.ts');
   const check=(ok,message)=>{if(!ok)throw new Error(message);};
   const keys=settingsSections.flatMap(section=>section.fields.map(field=>field.key));
   check(keys.length===new Set(keys).size&&keys.length===Object.keys(numericSettings).length,'Missing/duplicate grouped settings');
   for(const [key,field] of Object.entries(numericSettings)) {
    check(!soloSettingsSchema.safeParse({...defaults,[key]:field.max+field.step}).success,`Unbounded ${key}`);
   }
   const settings=soloSettingsSchema.parse({...defaults,bodyCount:10,gravity:0,arenaShrinks:false,chargeMs:1500,shotSpeed:2,shotMass:0.1,jetBoost:3,jetSeconds:2,superRadius:0.25,superSeconds:2,superTransitionMs:100,pulseRange:5,pulseSpeed:80,waveSeconds:1,waveCount:2,fluctuationSeconds:10,fluctuationRadius:8,hawkingDelay:0,hawkingChance:0,hawkingSeconds:2,hawkingMass:0.01,hawkingSpeed:0.5});
   check(shotChargeAt(840,settings)===50&&shotChargeAt(1500,settings)===100,'Custom charge timing');
   const game=new Game(document.createElement('canvas'));game.start([{id:0,isLocal:true}],'custom',settings);
   const body=()=>({type:'player',playerId:0,radius:100,mass:massFromRadius(100),position:{x:0,y:0},velocity:{x:0,y:0}});
   const source=body();source.storedBonus='jet';activateBonus(source,[source],settings);
   check(source.bonusTicks===120,'Custom item duration');game.blackHoles=[source];game.expulse(source,0);
   const shot=game.blackHoles[1];check(Math.abs(shot.mass/massFromRadius(100)-0.1)<1e-12,'Custom shot cost');
   check(Math.abs(shot.velocity.x/shot.radius-6)<1e-10,'Custom jet speed');
   check(Math.abs(source.mass*source.velocity.x+shot.mass*shot.velocity.x)<1e-7,'Custom momentum');
   check(radiusScale({activeBonus:'supermassive',bonusTicks:114},settings)===0.25,'Custom compression');
   const repulsor=body(),target=body();repulsor.storedBonus='pulse';target.position.x=250;
   activateBonus(repulsor,[repulsor,target],settings);check(Math.abs(target.velocity.x-20)<1e-12&&Math.abs(repulsor.velocity.x+20)<1e-12,'Custom pulse strength/range');
   const radiating=body();transferPickup({mass:0,pickup:'hawking'},radiating,0,[radiating],settings);
   check(radiating.hawkingTicks===120,'Custom radiation duration');game.blackHoles=[radiating];game.expulse(radiating,0,true);
   const fragment=game.blackHoles[1];check(Math.abs(fragment.mass/massFromRadius(100)-0.01)<1e-12&&Math.abs(fragment.velocity.x/fragment.radius-0.5)<1e-12,'Custom radiation mass/speed');
   const pickups=[];spawnFluctuations(pickups,'custom',60,5000,settings);
   check(pickups.length===2&&pickups.every(b=>b.radius===8&&b.expiresAt===660),'Custom fluctuation spawning');
   game.start([{id:0,isLocal:true}],'custom-replay',settings);const initial=game.getFrozenSnapshot();
   for(let frame=1;frame<=120;frame++)game.tick(new Map(),frame);
   const final=game.getFrozenSnapshot();game.rollbackToSnapshot(initial);
   for(let frame=1;frame<=120;frame++)game.tick(new Map(),frame);
   check(JSON.stringify(final)===JSON.stringify(game.getFrozenSnapshot()),'Custom rollback drift');
   const zeroSettings={...defaults,bodyCount:0,aiCount:0};
   game.start([{id:0,isLocal:true}],'solo-empty',zeroSettings);
   check(game.blackHoles.length===1&&game.blackHoles[0].type==='player','Zero neutral bodies must keep the player');
   game.start([{id:0,isLocal:true},{id:1,isLocal:false}],'players-only',{...zeroSettings,aiCount:32,playerRadius:1000,arenaRadius:5000});
   check(game.blackHoles.length===34&&game.blackHoles.filter(b=>b.type==='ai').length===32&&game.blackHoles.every(b=>b.radius===1000),'Player/AI counts and starting radius must be independent of neutral bodies');
   const crowded=game.getFrozenSnapshot();
   for(let tick=1;tick<=120;tick++)game.tick(new Map(),tick);
   const playersOnly=game.getFrozenSnapshot();
   check(playersOnly.every(b=>[b.mass,b.radius,b.position.x,b.position.y,b.velocity.x,b.velocity.y].every(Number.isFinite)),'Raised limits must stay finite');
   game.rollbackToSnapshot(crowded);
   for(let tick=1;tick<=120;tick++)game.tick(new Map(),tick);
   check(JSON.stringify(playersOnly)===JSON.stringify(game.getFrozenSnapshot()),'Players-only rollback drift');game.destroy();
   return {final,pickups,playersOnly};
  });
  if(reference)assert.deepEqual(result,reference);else reference=result;
  console.log(`PASS ${engine.name()}: grouped validated settings, custom shots/items/spawns, momentum, exact rollback`);
 }finally{await browser.close();}
}}finally{await server.close();}
