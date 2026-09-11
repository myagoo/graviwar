import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.scratch/fluctuations',{recursive:true});
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
let reference;
try {for(const engine of [chromium,firefox,webkit]){
 const browser=await engine.launch();
 try {
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const result=await page.evaluate(async()=>{
   const {Game}=await import('/src/Game.ts');const {BodyTree}=await import('/src/body-tree.ts');
   const {spawnFluctuations}=await import('/src/fluctuations.ts');const {massFromRadius}=await import('/src/mass.ts');
   const {DEFAULT_SOLO_SETTINGS}=await import('/src/solo-settings.ts');
   const {replaySchema}=await import('/src/replay.ts');
   const check=(ok,message)=>{if(!ok)throw new Error(message);};
   const body=(radius,x=0,playerId)=>({type:playerId===undefined?'cpu':'player',playerId,radius,mass:massFromRadius(radius),position:{x,y:0},velocity:{x:0,y:0}});
   const dot=(pickup,x=0)=>({...body(4,x),type:'fluctuation',pickup,expiresAt:2700});
   const waves=[];spawnFluctuations(waves,'test',239,1000);check(waves.length===0,'Spawned before wave');
   for(let frame=240;frame<=10000;frame+=240)spawnFluctuations(waves,'test',frame,1000);
   check(waves.length===24&&waves.every(b=>Math.sqrt(b.position.x**2+b.position.y**2)<=996),'Cap or arena bounds failed');
   const late=[];for(let seed=0;seed<50;seed++)spawnFluctuations(late,'late'+seed,3600,1000);
   check(late.some(b=>b.pickup==='hawking'),'No late-game radiation');
   const collector=body(80,0,0);collector.storedBonus='pulse';const pickup=dot('jet');
   new BodyTree([collector,pickup]).absorb();check(collector.storedBonus==='jet'&&pickup.mass===0,'Dot failed immediate replacement');
   const first=dot('jet'),second=dot('surge');new BodyTree([first,second]).absorb();check(first.mass>0&&second.mass>0,'Fluctuations ate each other');
   const neutral=body(40),carried=dot('surge');new BodyTree([neutral,carried]).absorb();check(neutral.pickup==='surge','Neutral did not carry item');
   const eater=body(100,0,0);new BodyTree([neutral,eater]).absorb();check(eater.storedBonus==='surge','Carried item was lost');
   const leader=body(200,2000,0),small=body(80,0,1),hazard=dot('hawking');
   new BodyTree([leader,small,hazard]).absorb();check(small.hawkingTicks===300&&!small.pickup,'Any consuming player should trigger radiation');
   const regular=body(60),radiation=dot('hawking');new BodyTree([regular,radiation]).absorb();
   check(regular.hawkingTicks===300&&!regular.pickup&&radiation.mass===0,'Regular hole must activate radiation immediately');
   const game=new Game(document.createElement('canvas'));game.start([{id:0,isLocal:true}],'fluctuation-replay',{...DEFAULT_SOLO_SETTINGS,bodyCount:10,aiCount:0,gravity:0,arenaShrinks:false});
   const radiating=body(100);radiating.hawkingTicks=300;radiating.velocity={x:3,y:-2};game.blackHoles=[radiating];
   const initialMass=radiating.mass,initial=game.getFrozenSnapshot();
   // This interval crosses a spawn boundary and covers the complete radiation effect.
   const run=()=>{for(let frame=1;frame<=300;frame++)game.tick(new Map(),frame);return game.getFrozenSnapshot();};
   const state=run();game.rollbackToSnapshot(initial);check(JSON.stringify(run())===JSON.stringify(state),'Rollback changed radiation/spawns');
   check(!game.blackHoles[0].hawkingTicks&&game.blackHoles[0].mass<initialMass*0.85,'Radiation did not finish shedding mass');
   check(replaySchema.safeParse({version:20,seed:'test',browser:'test',inputs:[],states:[state]}).success,'Snapshot schema lost new state');
   // Direct emission isolates conservation from later reabsorption and boundary reflections.
   const source=body(100,0,0);source.velocity={x:3,y:-2};game.blackHoles=[source];
   for(let i=0;i<50;i++)game.expulse(source,i*0.7,true);
   check(source.radius / 100 >= 2/3 && source.radius / 100 < 0.668,'Radiation must remove roughly one-third of the radius');
   const shot=game.blackHoles[1];
   check(Math.abs(shot.velocity.x-3-shot.radius)<1e-10&&shot.velocity.y===-2,'Radiated fragment must use the slower ejection speed');
   const mass=game.blackHoles.reduce((sum,b)=>sum+b.mass,0);
   check(Math.abs(mass-initialMass)<1e-7,'Radiation lost total mass');
   for(const axis of ['x','y'])check(Math.abs(game.blackHoles.reduce((sum,b)=>sum+b.mass*b.velocity[axis],0)-initialMass*({x:3,y:-2}[axis]))<1e-6,'Radiation lost momentum');
   const expired=dot('jet',5000);expired.expiresAt=1;game.blackHoles=[body(80,0,0),expired];game.tick(new Map(),1);check(!game.blackHoles.includes(expired),'Fluctuation did not expire');
   const shown=body(100,0,0);shown.hawkingTicks=200;
   game.blackHoles=[shown,dot('jet',300),dot('hawking',-300)];game.localPlayerId=0;game.localBlackHoleIndex=0;
   document.body.append(game.canvas);Object.assign(game.canvas.style,{position:'fixed',inset:'0',zIndex:'99',background:'black'});
   game.camera.zoomTo(2000);game.destroy();game.draw(0,100);
   return {waves,state};
  });
  await page.screenshot({path:`.scratch/fluctuations/${engine.name()}.png`});
  if(reference)assert.deepEqual(result,reference);else reference=result;
  console.log(`PASS ${engine.name()}: timed bounded spawning, collection/carrying, radiation, conservation, exact rollback`);
 }finally{await browser.close();}
}}finally{await server.close();}
