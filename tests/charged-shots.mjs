import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.scratch/charged-shots',{recursive:true});
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
let reference;
try {for(const engine of [chromium,firefox,webkit]){
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({viewport:{width:1000,height:700},hasTouch:true});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const result=await page.evaluate(async()=>{
   const {Game,shotChargeAt}=await import('/src/Game.ts');const {massFromRadius}=await import('/src/mass.ts');
   const {inputSchema}=await import('/src/bonuses.ts');const {RollbackNetcode}=await import('/src/netplayjs/netcode/rollback.ts');
   const {DEFAULT_SOLO_SETTINGS}=await import('/src/solo-settings.ts');
   const check=(v,m)=>{if(!v)throw new Error(m);};
   check(shotChargeAt(0)===0&&shotChargeAt(179)===0&&shotChargeAt(590)===50&&shotChargeAt(1000)===100&&shotChargeAt(9000)===100,'Charge curve failed');
   for(const input of [{clickDirection:0,shotCharge:-1},{clickDirection:0,shotCharge:101},{clickDirection:0,shotCharge:0.5},{activateBonus:true,shotCharge:50}])check(!inputSchema.safeParse(input).success,'Invalid network charge accepted');
   const canvas=document.createElement('canvas');document.body.append(canvas);Object.assign(canvas.style,{position:'fixed',inset:'0',zIndex:'3',background:'black'});
   const game=window.chargeGame=new Game(canvas);
   const local={id:0,isLocal:true},remote={id:1,isLocal:false,conn:{}};
   const settings={...DEFAULT_SOLO_SETTINGS,bodyCount:10,aiCount:0,gravity:0,arenaShrinks:false};
   game.start([local,remote],'charged-shots',settings);
   const body=()=>({type:'player',playerId:0,radius:100,mass:massFromRadius(100),position:{x:0,y:0},velocity:{x:3,y:-2}});
   const shots=[];
   for(const charge of [0,25,50,100]){
    const source=body();game.blackHoles=[source];game.expulse(source,0,false,charge);
    const shot=game.blackHoles[1];shots.push(shot.velocity.x-3);
    check(Math.abs(source.mass+shot.mass-massFromRadius(100))<1e-7,'Charge changed mass cost');
    check(Math.abs(source.mass*source.velocity.x+shot.mass*shot.velocity.x-massFromRadius(100)*3)<1e-7,'Charged shot lost momentum');
    check(Math.abs((3-source.velocity.x)/(shots[0]/19)-(charge<=50?1+charge/50:charge/25))<1e-10,'Charge recoil mismatch');
   }
   check(Math.abs(shots[2]/shots[0]-2)<1e-12&&Math.abs(shots[3]/shots[0]-4)<1e-12,'Half/full charge must be 2x/4x');
   game.start([local,remote],'charged-rollback',settings);
   const initial=game.getFrozenSnapshot(),netcode=new RollbackNetcode(game,[local,remote],()=>{});
   for(let tick=1;tick<=30;tick++)netcode.tick();netcode.onRemoteInput(5,remote,{clickDirection:0.7,shotCharge:100});
   const rolled=game.getFrozenSnapshot();game.rollbackToSnapshot(initial);
   for(let tick=1;tick<=30;tick++)game.tick(new Map([[remote,tick===5?{clickDirection:0.7,shotCharge:100}:undefined]]),tick);
   check(JSON.stringify(rolled)===JSON.stringify(game.getFrozenSnapshot()),'Charged shot rollback diverged');
   game.start([local],'charged-ui',settings);
   window.drawCharge=()=>game.draw(0,1);
   return {shots,rolled};
  });
  if(reference)assert.deepEqual(result,reference);else reference=result;
  await page.mouse.click(800,350);
  let input=await page.evaluate(()=>window.chargeGame.flushInputBuffer());assert.equal(input.clickDirection,0);assert.equal(input.shotCharge,undefined);
  await page.mouse.move(800,350);await page.mouse.down();
  await page.waitForTimeout(250);await page.evaluate(()=>window.drawCharge());
  assert(await page.getByRole('progressbar',{name:'Shot charge'}).isVisible());
  assert.equal(await page.evaluate(()=>window.chargeGame.flushInputBuffer()),undefined,'Fired while holding');
  await page.mouse.move(500,100);await page.waitForTimeout(800);await page.evaluate(()=>window.drawCharge());
  assert.equal(await page.getByRole('progressbar',{name:'Shot charge'}).getAttribute('value'),'100');
  await page.screenshot({path:`.scratch/charged-shots/${engine.name()}.png`});
  await page.mouse.up();input=await page.evaluate(()=>window.chargeGame.flushInputBuffer());
  assert.equal(input.shotCharge,100);assert(Math.abs(input.clickDirection+Math.PI/2)<1e-12,'Release ignored dragged aim');
  assert.equal(await page.getByRole('progressbar',{name:'Shot charge'}).count(),0);
  await page.touchscreen.tap(800,350);input=await page.evaluate(()=>window.chargeGame.flushInputBuffer());assert.equal(input.shotCharge,undefined,'Touch tap charged');
  await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.chargeGame.flushInputBuffer()),undefined,'Cancelled press fired');
  await page.mouse.down();await page.evaluate(()=>window.chargeGame.handleTouchStart({touches:[{clientX:100,clientY:100},{clientX:200,clientY:100}]}));await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.chargeGame.flushInputBuffer()),undefined,'Pinch fired a shot');
  await page.evaluate(()=>window.chargeGame.destroy());
  console.log(`PASS ${engine.name()}: tap, hold, drag aim, touch, cancellation, charge validation, 4x speed/recoil, exact rollback`);
 }finally{await browser.close();}
}}finally{await server.close();}
