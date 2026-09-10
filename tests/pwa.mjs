import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
import {preview} from 'vite';
const server=await preview({base:'/graviwar/',preview:{host:'127.0.0.1',port:0,open:false}});
await mkdir('.scratch/pwa',{recursive:true});
try {
 for(const engine of [chromium,firefox,webkit].filter(engine=>!process.env.BROWSERS||process.env.BROWSERS.split(',').includes(engine.name()))) {
  const browser=await engine.launch();
  try {
   const context=await browser.newContext();
   await context.addInitScript(()=>{
    window.socketCount=0;window.tickLoops=0;
    const WS=window.WebSocket;window.WebSocket=class extends WS {constructor(...args){super(...args);window.socketCount++;}};
    const interval=window.setInterval;window.setInterval=(fn,time,...args)=>{if(time>16&&time<17)window.tickLoops++;return interval(fn,time,...args);};
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   // Playwright Chromium can report online after an offline reload (microsoft/playwright#42174).
   // Keep real network emulation; supply connectivity events explicitly (Firefox also misses reconnect events).
   if(engine!==firefox)await context.addInitScript(()=>{
    Object.defineProperty(navigator,'onLine',{get:()=>sessionStorage.testOffline!=='true'});
   });
   const port=server.httpServer.address().port;
   const setOffline=async offline=>{
    // WebKit automation cannot reload offline SW pages; actually stop the origin instead.
    if(engine===webkit){
     if(offline){server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}
     else await new Promise(resolve=>server.httpServer.listen(port,'127.0.0.1',resolve));
    }else await context.setOffline(offline);
    await page.evaluate(value=>{
     sessionStorage.testOffline=String(value);
     window.dispatchEvent(new Event(value?'offline':'online'));
    },offline);
   };
   const url=`http://127.0.0.1:${server.httpServer.address().port}/graviwar/`;
   await page.goto(url);
   assert.equal(await page.getByRole('button').count(),2,'Homepage must have only two play options');
   assert.equal(await page.locator('.build-version').innerText(),execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8'}).trim());
   for(const [width,height] of [[1280,720],[390,844],[844,390]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>document.querySelector('.home-stars').width===innerWidth);
    assert(await page.locator('.home-stars').evaluate(canvas=>{
     const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
     let stars=0;for(let i=3;i<data.length;i+=4)if(data[i])stars++;
     return stars>100;
    }),'Homepage starfield is empty');
    const buttons=await page.getByRole('button').all();
    for(const button of buttons){const box=await button.boundingBox();assert(box.y>=0&&box.y+box.height<=height&&box.x>=0&&box.x+box.width<=width);}
    await page.screenshot({path:`.scratch/pwa/${engine.name()}-home-${width}.png`});
   }
   await page.setViewportSize({width:1280,height:720});
   const manifest=await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    return (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
   });
   assert.equal(manifest.name,'Graviwar');assert.equal(manifest.scope,'/graviwar/');assert.equal(manifest.start_url,'/graviwar/');
   assert(manifest.icons.some(icon=>icon.purpose==='maskable'));
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   if(engine===chromium){const cdp=await context.newCDPSession(page);const {installabilityErrors:installErrors}=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(installErrors,[]);await cdp.detach();}
   await setOffline(true);await page.reload();
   assert(await page.evaluate(()=>fetch('offline-probe',{cache:'no-store'}).then(()=>false,()=>true)),'Offline requests reached the network');
   assert(await page.getByRole('button',{name:'Multiplayer',exact:true}).isDisabled());
   assert(await page.getByRole('img',{name:'Graviwar black-hole logo'}).evaluate(img=>img.complete&&img.naturalWidth===512));
   assert.equal(await page.evaluate(()=>window.socketCount),0);
   await page.screenshot({path:`.scratch/pwa/${engine.name()}-offline.png`});
   await page.getByRole('button',{name:'Solo',exact:true}).click();await page.getByRole('button',{name:'Start solo game'}).click();
   assert.equal(await page.locator('canvas').count(),1);
   const loops=await page.evaluate(()=>window.tickLoops);
   await setOffline(false);await page.waitForTimeout(100);await setOffline(true);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>window.tickLoops),loops,'Connectivity changes restarted solo');
   await page.getByRole('button',{name:'Back to menu'}).click();
   await page.goto(url+'?wrapper=rollback#room=123');
   await page.getByRole('status').filter({hasText:'Multiplayer needs an internet connection'}).waitFor();
   assert.equal(await page.evaluate(()=>window.socketCount),0,'Offline invitation opened signaling');
   await page.getByRole('button',{name:'Back to menu'}).click();
   await setOffline(false);
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Multiplayer').disabled);
   await page.getByRole('button',{name:'Multiplayer',exact:true}).click();
   await page.getByRole('link',{name:'Invite link'}).waitFor();
   await setOffline(true);
   await page.getByRole('status').filter({hasText:'Multiplayer needs an internet connection'}).waitFor();
   await setOffline(false);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${engine.name()}: production scope, cached offline reload/icons, offline solo, online/offline transitions, multiplayer guard`);
  } finally {await browser.close();}
 }
} finally {await new Promise(resolve=>server.httpServer.close(resolve));}
