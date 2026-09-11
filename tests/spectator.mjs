import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();
try { for (const engine of [chromium, firefox, webkit]) {
 const browser = await engine.launch();
 try {
  const page = await browser.newPage({viewport:{width:1000,height:700},hasTouch:true});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(async () => {
   const {Game}=await import('/src/Game.ts');
   const canvas=document.createElement('canvas');document.body.append(canvas);
   Object.assign(canvas.style,{position:'fixed',inset:'0',zIndex:10});
   const game=window.game=new Game(canvas);
   game.start([{id:0,isLocal:true},{id:1,isLocal:false}],'spectator',{bodyCount:1,aiCount:0,gravity:0,arenaShrinks:false});
   game.blackHoles[0].position={x:100,y:200};game.blackHoles[1].position={x:900,y:200};
   game.camera.zoomTo(4000);game.draw(0,0);
   window.cameraBefore=JSON.stringify([game.camera.distance,game.camera.viewport]);
   game.blackHoles.splice(0,1);game.localBlackHoleIndex=undefined;game.draw(0,1);
   if(JSON.stringify([game.camera.distance,game.camera.viewport])!==window.cameraBefore)throw Error('Death moved camera');
   window.hud=[];game.ctx.fillText=(text)=>window.hud.push(text);game.draw(0,1);
  });
  assert((await page.evaluate(()=>window.hud)).includes('1 PLAYERS / 1 BLACK HOLES'));
  await page.mouse.move(500,350);await page.mouse.down();await page.mouse.move(600,400);await page.mouse.up();
  assert.equal(await page.evaluate(()=>game.camera.viewport.left),-2300);
  assert.equal(await page.evaluate(()=>game.flushInputBuffer()),undefined);
  const point=await page.evaluate(()=>game.camera.worldToScreen(game.blackHoles[0].position));
  await page.mouse.click(point.x,point.y);
  await page.evaluate(()=>{game.draw(0,2);if((game.camera.viewport.left+game.camera.viewport.right)/2!==900)throw Error('Tap failed to follow');
   const snapshot=game.getFrozenSnapshot();game.rollbackToSnapshot(snapshot);game.blackHoles[0].position.x=1100;game.draw(0,3);
   if((game.camera.viewport.left+game.camera.viewport.right)/2!==1100)throw Error('Rollback lost follow');});
  await page.touchscreen.tap(500,350);
  await page.evaluate(()=>{game.blackHoles[0].position.x=1300;game.draw(0,4);if((game.camera.viewport.left+game.camera.viewport.right)/2!==1100)throw Error('Second tap failed to detach');
   game.blackHoles=[];game.draw(0,5);if(game.camera.distance!==4000)throw Error('Spectator zoom changed');game.destroy();});
  console.log(`${engine.name()}: HUD, death camera, pan, tap follow/unfollow and rollback passed`);
 } finally {await browser.close();}
}} finally {await server.close();}
