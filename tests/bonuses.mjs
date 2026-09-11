import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
await mkdir('.scratch/bonuses',{recursive:true});let reference;
try {
for(const engine of [chromium,firefox,webkit]) {
const browser=await engine.launch();
try {
const page=await browser.newPage({viewport:{width:1000,height:800}});
await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
const result=await page.evaluate(async()=>{
 const {Game}=await import('/src/Game.ts');const {BodyTree}=await import('/src/body-tree.ts');
 const {activateBonus,transferPickup}=await import('/src/bonuses.ts');
 const {massFromRadius}=await import('/src/mass.ts');
 const {DataSchema}=await import('/src/netplayjs/types.ts');
 const {RollbackNetcode}=await import('/src/netplayjs/netcode/rollback.ts');
 const {replaySchema,firstDifference}=await import('/src/replay.ts');
 const check=(value,message)=>{if(!value)throw new Error(message);};
 const body=(r,x,id)=>({type:id===undefined?'cpu':'player',...(id===undefined?{}:{playerId:id}),mass:massFromRadius(r),radius:r,position:{x,y:0},velocity:{x:0,y:0}});
 check(DataSchema.safeParse({type:'input',frame:1,playerID:1,input:{activateBonus:true}}).success,'Network rejected bonus input');
 const pickup=body(40,0);pickup.pickup='jet';const eater=body(100,0,0);eater.storedBonus='pulse';
 new BodyTree([pickup,eater]).absorb();check(eater.storedBonus==='jet'&&!pickup.pickup,'Full absorption must replace slot');
 const partial=body(80,150);partial.pickup='supermassive';const collector=body(100,0,0);
 new BodyTree([collector,partial]).absorb();check(partial.mass>0&&partial.pickup&&!collector.storedBonus,'Partial absorption awarded early');
 const majority=body(100,0,1),finisher=body(100,0,2);partial.pickupClaims=[{id:1,mass:100}];partial.mass=0;
 transferPickup(partial,finisher,10,[majority,finisher,partial]);check(majority.storedBonus==='supermassive'&&!finisher.storedBonus,'Last hit stole majority reward');
 const game=new Game(document.createElement('canvas'));game.start([{id:0,isLocal:true}],'bonus-timer');
 const {spawnFluctuations}=await import('/src/fluctuations.ts');
 check(!game.blackHoles.some(b=>b.pickup),'Items must not spawn upfront');
 const counts={surge:0,pulse:0,jet:0,supermassive:0};
 for(let seed=0;seed<1500;seed++){
  const wave=[];spawnFluctuations(wave,`rarity-${seed}`,240,5000);
  for(const hole of wave)if(hole.pickup)counts[hole.pickup]++;
 }
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 for(const [bonus,count] of Object.entries(counts))
  check(Math.abs(count/total-(bonus==='supermassive'?1/7:2/7))<0.025,'Incorrect item rarity: '+JSON.stringify(counts));
 const player=body(100,0,0);player.storedBonus='supermassive';game.blackHoles=[player];
 const original=player.mass;game.tick(new Map([[{id:0,isLocal:true},{activateBonus:true,clickDirection:0}]]),1);
 check(player.activeBonus==='supermassive'&&player.bonusTicks===180&&player.mass===original&&player.radius===100&&game.blackHoles.length===1,'Activation changed mass/radius or allowed expulsion');
 for(let tick=2;tick<=180;tick++)game.tick(new Map([[{id:0,isLocal:true},{clickDirection:0}]]),tick);
 check(player.activeBonus==='supermassive'&&player.mass===original,'Supermassive ended too early');
 game.tick(new Map([[{id:0,isLocal:true},{clickDirection:0}]]),181);
 check(!player.activeBonus&&game.blackHoles.length===2,'Supermassive failed to expire');
 const acceleration=(bonus,radius=50)=>{const source=body(100,0,0),target=body(radius,1000);source.activeBonus=bonus;new BodyTree([source,target]).applyGravity(0.1);return target.velocity.x;};
 check(Math.abs(acceleration('supermassive')/acceleration(undefined)-8)<1e-12,'Supermassive pull is not 8x');
 check(Math.abs(acceleration('surge')/acceleration(undefined)-3)<1e-12&&acceleration('surge',200)===acceleration(undefined,200),'Surge must affect only smaller bodies');
 const jet=body(100,0,0),normal=body(100,0,0);jet.storedBonus='jet';activateBonus(jet,[jet]);game.blackHoles=[jet];game.expulse(jet,0);const fast=game.blackHoles.at(-1).velocity.x;
 game.blackHoles=[normal];game.expulse(normal,0);check(Math.abs(fast-game.blackHoles.at(-1).velocity.x*6)<1e-10&&jet.bonusTicks===300,'Jet boost incorrect');
 check(Math.abs(jet.velocity.x-normal.velocity.x*6)<1e-12,'Jet recoil must scale with projectile speed');
 check(Math.abs(jet.mass*jet.velocity.x+(massFromRadius(100)-jet.mass)*fast)<1e-7,'Jet lost momentum');
 const shield=body(100,0,0),large=body(200,290,1);
 shield.storedBonus='pulse';shield.velocity={x:8,y:3};large.velocity={x:-2,y:1};
 activateBonus(shield,[shield,large]);
 check(shield.activeBonus==='pulse'&&shield.bonusTicks===300&&!shield.storedBonus,'Shield duration/consumption');
 const momentum=()=>shield.mass*shield.velocity.x+large.mass*large.velocity.x;
 const energy=()=>shield.mass*(shield.velocity.x**2+shield.velocity.y**2)+large.mass*(large.velocity.x**2+large.velocity.y**2);
 const beforeMomentum=momentum(),beforeEnergy=energy(),masses=[shield.mass,large.mass];
 new BodyTree([shield,large]).absorb();
 check(shield.mass===masses[0]&&large.mass===masses[1],'Shield allowed absorption');
 check(shield.velocity.x<large.velocity.x&&shield.velocity.y===3&&large.velocity.y===1,'Elastic normal/tangent response');
 check(Math.abs(momentum()-beforeMomentum)<1e-7&&Math.abs(energy()-beforeEnergy)<1e-6,'Shield lost momentum/energy');
 check(Math.abs(large.position.x-shield.position.x-300)<1e-10,'Shield did not separate overlap');
 const separating=JSON.stringify([shield.velocity,large.velocity]);new BodyTree([shield,large]).absorb();
 check(JSON.stringify([shield.velocity,large.velocity])===separating,'Separating bodies bounced again');
 const food=body(40,shield.position.x);new BodyTree([shield,food]).absorb();check(food.mass===0,'Shield prevented eating smaller bodies');
 delete shield.activeBonus;large.position.x=shield.position.x+250;new BodyTree([shield,large]).absorb();check(shield.mass<masses[0]+food.mass,'Expired shield prevented absorption');
 const coincident=body(100,0,0),giant=body(200,0);coincident.activeBonus='pulse';new BodyTree([coincident,giant]).absorb();
 check(Number.isFinite(coincident.position.x)&&Math.abs(giant.position.x-coincident.position.x-300)<1e-10,'Coincident shield contact');

 const remote={id:1,isLocal:false,conn:{}},local={id:0,isLocal:true};
 game.start([local,remote],'bonus-replay');game.blackHoles[1].storedBonus='supermassive';
 const initial=game.getFrozenSnapshot();const netcode=new RollbackNetcode(game,[local,remote],()=>{});
 for(let tick=1;tick<=30;tick++)netcode.tick();netcode.onRemoteInput(5,remote,{activateBonus:true});
 const rolled=game.getFrozenSnapshot();game.rollbackToSnapshot(initial);
 for(let tick=1;tick<=30;tick++)game.tick(new Map([[remote,tick===5?{activateBonus:true}:undefined]]),tick);
 check(JSON.stringify(game.getFrozenSnapshot())===JSON.stringify(rolled),'Late bonus activation broke rollback');
 const replay={version:22,seed:'bonus',browser:'test',inputs:[],states:[rolled]};
 check(replaySchema.safeParse(replay).success,'Replay rejected bonus state');
 const altered=structuredClone(rolled);altered[1].bonusTicks=1;check(!!firstDifference(rolled,altered),'Replay missed bonus drift');
 partial.pickupClaims=[{id:0,mass:10}];
 game.rollbackToSnapshot([collector,partial]);const snapshot=game.getFrozenSnapshot();
 snapshot[1].pickupClaims[0].mass=999999;check(game.blackHoles[1].pickupClaims[0].mass!==999999,'Claims alias snapshot');
 const visualPlayer=body(100,0,0);visualPlayer.storedBonus='pulse';game.blackHoles=[visualPlayer];
 const beforeShield=game.getFrozenSnapshot();
 game.tick(new Map([[local,{activateBonus:true}]]),100);const shieldState=game.getFrozenSnapshot();
 game.rollbackToSnapshot(beforeShield);game.tick(new Map([[local,{activateBonus:true}]]),100);
 check(JSON.stringify(game.getFrozenSnapshot())===JSON.stringify(shieldState),'Shield rollback differs');
 game.rollbackToSnapshot(beforeShield);game.tick(new Map(),100);
 check(!game.blackHoles[0].activeBonus,'Cancelled activation left shield');
 game.tick(new Map([[local,{activateBonus:true}]]),101);
 for(let tick=102;tick<=401;tick++)game.tick(new Map(),tick);
 check(!game.blackHoles.find(b=>b.playerId===0).activeBonus,'Shield did not expire after five seconds');
 game.settings.gravity=0;game.settings.arenaShrinks=false;
 const protectedRemote=body(100,0,1),predator=body(200,350,0);protectedRemote.storedBonus='pulse';protectedRemote.velocity.x=3;
 game.blackHoles=[protectedRemote,predator];const shieldInitial=game.getFrozenSnapshot();
 const shieldNet=new RollbackNetcode(game,[local,remote],()=>{});
 for(let tick=1;tick<=30;tick++)shieldNet.tick();shieldNet.onRemoteInput(5,remote,{activateBonus:true});
 const shieldRolled=game.getFrozenSnapshot();game.rollbackToSnapshot(shieldInitial);
 for(let tick=1;tick<=30;tick++)game.tick(new Map([[remote,tick===5?{activateBonus:true}:undefined]]),tick);
 check(JSON.stringify(game.getFrozenSnapshot())===JSON.stringify(shieldRolled),'Late shield collision activation broke rollback');
 check(shieldRolled.find(b=>b.playerId===1).mass===massFromRadius(100),'Late shield did not restore absorbed mass');
 game.destroy();return {rolled,counts,shieldRolled};
});
if(reference)assert.deepEqual(result,reference,'Bonus physics drifted between browsers');else reference=result;
// Real menu, accessible button, and keyboard path.
await page.reload();
await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/src/Game.ts')).name;const {Game}=await import(url);const start=Game.prototype.start;Game.prototype.start=function(...args){start.apply(this,args);window.bonusGame=this;};});
await page.getByRole('button',{name:'Solo',exact:true}).click();await page.getByRole('button',{name:'Start solo game'}).click();
await page.evaluate(()=>{
const game=window.bonusGame,body=game.blackHoles.find(b=>b.playerId===0);body.storedBonus='supermassive';
body.position={x:0,y:0};body.velocity={x:0,y:0};
const mystery={type:'cpu',mass:1000,radius:31.7,position:{x:500,y:0},velocity:{x:0,y:0},pickup:'pulse'};
game.blackHoles=[body,mystery];game.settings.gravity=0;game.settings.arenaShrinks=false;
});
assert.equal(await page.getByRole('button',{name:'Back to menu'}).isVisible(),false);
const massBeforeMenu=await page.evaluate(()=>window.bonusGame.blackHoles[0].mass);
await page.getByRole('button',{name:'Game menu',exact:true}).click();
await page.getByRole('heading',{name:'How to play'}).waitFor();
for(const [item,name,color] of [
 ['surge','Accretion Surge','rgb(255, 201, 131)'],['pulse','Repulsion Shield','rgb(255, 117, 106)'],
 ['jet','Relativistic Jet','rgb(145, 216, 255)'],['supermassive','Supermassive','rgb(212, 173, 255)']
]){
 await page.evaluate(item=>{window.bonusGame.blackHoles[0].storedBonus=item;},item);
 await page.getByRole('button',{name:`Use ${name} · Space`,exact:true}).waitFor();
 const colors=await page.locator('.item-button').evaluate(button=>[getComputedStyle(button).color,getComputedStyle(button).borderTopColor,getComputedStyle(button.querySelector('svg')).color]);
 assert.deepEqual(colors,[color,color,color]);
 assert.equal(await page.locator('.item-legend dt').filter({hasText:name}).evaluate(dt=>getComputedStyle(dt).color),color);
}

await page.keyboard.press('Escape');
assert.equal(await page.getByRole('heading',{name:'How to play'}).isVisible(),false);
assert.equal(await page.evaluate(()=>window.bonusGame.blackHoles[0].mass),massBeforeMenu,'Menu click expelled matter');
const zoom=await page.evaluate(()=>{
 const game=window.bonusGame,radius=game.blackHoles[0].radius;
 for(let i=0;i<100;i++)game.handleWheel(new WheelEvent('wheel',{deltaY:-100}));
 const wheel=game.camera.distance/radius;
 game.camera.zoomTo(radius*100);
 game.handleTouchStart({touches:[{clientX:0,clientY:0},{clientX:10,clientY:0}]});
 const move=new Event('touchmove');Object.defineProperty(move,'touches',{value:[{clientX:0,clientY:0},{clientX:1000,clientY:0}]});game.canvas.dispatchEvent(move);
 const pinch=game.camera.distance/radius;
 const end=new Event('touchend');Object.defineProperty(end,'touches',{value:[]});game.canvas.dispatchEvent(end);
 game.draw(0,0);
 return {wheel,pinch,afterDraw:game.camera.distance/radius};
});
assert.deepEqual(zoom,{wheel:10,pinch:10,afterDraw:10});
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'Game menu',exact:true}).click();
const originalGame=await page.evaluate(()=>{window.positionGame=window.bonusGame;return true;});
assert(originalGame);
assert.equal(await page.locator('.item-legend dt svg').count(),4);
for(const [label,position] of [['Left','left'],['Right','right'],['Center','center']]){
 await page.getByRole('radio',{name:label,exact:true}).check();
 const box=await page.locator('.item-button').boundingBox();
 assert.equal(box.width,52);assert.equal(box.height,52);
 assert.equal(box.y+box.height,828);
 assert.equal(box.x,position==='left'?16:position==='right'?322:169);
 assert.equal(await page.evaluate(()=>window.bonusGame===window.positionGame),true,'Position change restarted the game');
 assert.equal(await page.evaluate(()=>localStorage.getItem('graviwar.item-position')),position);
}
await page.screenshot({path:`.scratch/bonuses/${engine.name()}-menu.png`});
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Use Supermassive · Space',exact:true}).click();
await page.getByRole('button',{name:/Supermassive · .*s/}).waitFor();
assert(await page.getByRole('button',{name:/Supermassive · .*s/}).isDisabled());
await page.screenshot({path:`.scratch/bonuses/${engine.name()}.png`});
await page.evaluate(()=>{const b=window.bonusGame.blackHoles.find(b=>b.playerId===0);delete b.activeBonus;delete b.bonusTicks;b.storedBonus='jet';});
await page.locator('canvas').focus();await page.keyboard.press('Space');
await page.getByRole('button',{name:/Relativistic Jet · .*s/}).waitFor();
if(await page.getByRole('button',{name:'Game menu',exact:true}).count())await page.getByRole('button',{name:'Game menu',exact:true}).click();
      await page.getByRole('button',{name:'Back to menu'}).click();
await page.reload();
await page.getByRole('button',{name:'Solo',exact:true}).click();await page.getByRole('button',{name:'Start solo game'}).click();
await page.getByRole('button',{name:'Game menu',exact:true}).click();
assert(await page.getByRole('radio',{name:'Center',exact:true}).isChecked(),'Item position was not restored');
console.log(`PASS ${engine.name()}: pickup replacement, majority credit, four effects, 180-tick expiry, input/UI, snapshots, exact rollback`);
} finally {await browser.close();}
}
} finally {await server.close();}
