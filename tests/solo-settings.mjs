import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';

await mkdir('.scratch/solo-settings',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();
try {
  for(const engine of [chromium,firefox,webkit]) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:1000,height:850}}), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const base=`http://127.0.0.1:${server.httpServer.address().port}`;
      const open=()=>page.getByRole('button',{name:'Solo',exact:true}).click();
      const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('graviwar.solo-settings.v1')));
      const inspect=()=>page.evaluate(async()=>{
        const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/src/Game.ts')).name;
        const {Game}=await import(url);const start=Game.prototype.start;
        Game.prototype.start=function(...args){
          start.apply(this,args);window.activeGame=this;
          window.initial={bodies:this.getFrozenSnapshot(),arena:this.arenaRadius,g0:this.gravityAt(0),g60:this.gravityAt(60),g600:this.gravityAt(600)};
        };
      });
      await page.goto(base);await open();
      const fill=async(label,value)=>{
        const slider=page.getByRole('slider',{name:label,exact:true});
        await slider.focus();
        await slider.evaluate((input,value)=>{
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
        },value);
      };
      await fill('Arena radius',5000);await fill('Gravitational constant',0.35);
      await page.getByLabel('Increase gravity over time',{exact:true}).uncheck();
      await fill('Total bodies (including you)',24);await fill('Minimum body radius',20);
      await fill('Maximum body radius',40);await fill('Your starting radius',80);
      const expected={arenaRadius:5000,gravity:0.35,gravityIncreases:false,bodyCount:24,minBodyRadius:20,maxBodyRadius:40,playerRadius:80};
      assert.deepEqual(await stored(),expected);
      await fill('Maximum body radius',10);
      assert.equal((await stored()).minBodyRadius,10,'Upper slider must keep the lower bound valid');
      await fill('Minimum body radius',20);
      assert.equal((await stored()).maxBodyRadius,20,'Lower slider must keep the upper bound valid');
      await fill('Maximum body radius',40);
      await page.reload();await open();
      assert.equal(await page.getByLabel('Arena radius',{exact:true}).inputValue(),'5000');
      assert.equal(await page.getByLabel('Increase gravity over time',{exact:true}).isChecked(),false);
      const arenaSlider=page.getByRole('slider',{name:'Arena radius',exact:true});
      await arenaSlider.press('End');assert.equal((await stored()).arenaRadius,50000);
      await arenaSlider.press('Home');assert.equal((await stored()).arenaRadius,5000);
      await arenaSlider.press('ArrowRight');assert.equal((await stored()).arenaRadius,5500);
      await arenaSlider.press('ArrowLeft');
      await page.screenshot({path:`.scratch/solo-settings/${engine.name()}.png`});
      await inspect();await page.getByRole('button',{name:'Start solo game'}).click();
      const initial=await page.evaluate(()=>window.initial);
      assert.equal(initial.arena,5000);assert.equal(initial.bodies.length,24);
      assert.equal(initial.bodies[0].radius,80);
      assert(initial.bodies.slice(1).every(b=>b.radius>=20&&b.radius<=40));
      assert(initial.bodies.every(b=>Math.sqrt(b.position.x*b.position.x+b.position.y*b.position.y)+b.radius<=5000));
      assert.equal(initial.g0,0.35);assert.equal(initial.g60,0.35);assert.equal(initial.g600,0.35);
      assert(await page.evaluate(()=>{
        const game=window.activeGame,body=game.blackHoles.find(b=>b.playerId===0);
        game.blackHoles=[body];body.position={x:4990-body.radius,y:0};body.velocity={x:20,y:0};
        game.tick(new Map(),1);
        return body.position.x===game.arenaRadius-body.radius&&body.velocity.x<0;
      }),'Selected arena radius did not constrain movement');
      await page.getByRole('button',{name:'Back to menu'}).click();await open();
      await page.getByLabel('Increase gravity over time',{exact:true}).check();
      await page.getByRole('button',{name:'Start solo game'}).click();
      const raised=await page.evaluate(()=>window.initial);
      assert(Math.abs(raised.g60-raised.g0-0.024)<1e-12);
      await page.getByRole('button',{name:'Back to menu'}).click();
      // Saved solo preferences must never affect a default/multiplayer Game.start.
      const normal=await page.evaluate(()=>{
        const game=window.activeGame;game.start([{id:0,isLocal:true}], 'default-check');
        const state={count:game.blackHoles.length,arena:game.arenaRadius,gravity:game.gravityAt(0),area:game.blackHoles[0].area};game.destroy();return state;
      });
      assert.deepEqual(normal,{count:1000,arena:20000,gravity:0.1,area:75000});
      assert(await page.evaluate(()=>{
        const game=window.activeGame;
        for (const crowded of [false,true]) {
          game.start([{id:0,isLocal:true}],'slider-extremes',{
            arenaRadius:crowded?5000:50000,gravity:crowded?1:0,gravityIncreases:false,
            bodyCount:crowded?5000:10,minBodyRadius:crowded?150:10,
            maxBodyRadius:crowded?150:10,playerRadius:crowded?300:30,
          });
          for(let tick=0;tick<60;tick++) game.tick(new Map(),tick);
          if(!game.blackHoles.every(b=>[b.position.x,b.position.y,b.velocity.x,b.velocity.y,b.radius,b.area].every(Number.isFinite))) return false;
        }
        game.destroy();return true;
      }),'Slider extremes must remain finite during simulation');
      await open();await page.getByRole('button',{name:'Reset defaults'}).click();
      assert.equal((await stored()).bodyCount,1000);
      await page.evaluate(()=>localStorage.setItem('graviwar.solo-settings.v1','broken json'));
      await page.reload();await open();
      assert.equal(await page.getByLabel('Arena radius',{exact:true}).inputValue(),'20000');
      await page.setViewportSize({width:390,height:700});
      await page.getByRole('button',{name:'Start solo game'}).scrollIntoViewIfNeeded();
      assert(await page.getByRole('button',{name:'Start solo game'}).isVisible());
      await page.reload();
      await page.evaluate(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError');}}));
      await open();await fill('Total bodies (including you)',12);
      await page.getByRole('status').filter({hasText:'could not save'}).waitFor();
      await page.getByRole('button',{name:'Start solo game'}).click();
      assert.equal(await page.locator('canvas').count(),1);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine.name()}: solo preferences, persistence, validation, applied physics, defaults, unavailable storage, mobile form`);
    } finally {await browser.close();}
  }
} finally {await server.close();}
