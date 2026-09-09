import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';

await mkdir('.scratch/graphics', { recursive: true });
const server = await createServer({ server: {host:'127.0.0.1',port:0,open:false},logLevel:'error' });
await server.listen();
try {
  for (const engine of [chromium, firefox, webkit]) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:1440,height:900}});
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      const result=await page.evaluate(async () => {
        const { Game }=await import('/src/Game.ts');
        const { Camera }=await import('/src/Camera.ts');
        const { drawStars, drawBlackHole, HOLE_COLORS }=await import('/src/space-renderer.ts');
        const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;
        const ctx=canvas.getContext('2d'), camera=new Camera(ctx);
        camera.zoomTo(4000);camera.lookAt(0,0);
        const points=[]; const fill=ctx.fillRect.bind(ctx);
        ctx.fillRect=(...args)=>{points.push(args);fill(...args);};
        drawStars(ctx,camera);
        const before=points.splice(0);
        camera.lookAt(100,0);drawStars(ctx,camera);
        const after=points.splice(0);
        const anchor=before.find(([x,y])=>x>100 && x<1300 && y>100 && y<800);
        const anchored=after.some(([x,y])=>Math.abs(x-(anchor[0]-36))<1e-8 && Math.abs(y-anchor[1])<1e-8);
        drawStars(ctx,camera);
        const stable=JSON.stringify(after)===JSON.stringify(points);
        points.length=0;
        camera.lookAt(80000,80000);drawStars(ctx,camera);
        const farBefore=points.splice(0);
        camera.lookAt(80100,80000);drawStars(ctx,camera);
        const farAnchored=farBefore.some(([x,y])=>x>100 && x<1300 && y>100 && y<800 &&
          points.some(([nextX,nextY])=>Math.abs(nextX-(x-36))<1e-8 && Math.abs(nextY-y)<1e-8));
        ctx.fillRect=fill;
        const brightnessAt = zoom => {
          camera.zoomTo(zoom);camera.lookAt(0,0);
          let brightest=0;
          ctx.fillRect=()=>{brightest=Math.max(brightest,ctx.globalAlpha);};
          drawStars(ctx,camera);
          ctx.fillRect=fill;
          return brightest;
        };
        const starBrightness=[4000,12000,40000].map(brightnessAt);
        ctx.clearRect(0,0,1440,900);
        drawBlackHole(ctx,{x:200,y:200},40,HOLE_COLORS.local);
        const center=[...ctx.getImageData(200,200,1,1).data];
        const ring=[...ctx.getImageData(241,200,1,1).data];
        ctx.clearRect(0,0,1440,900);
        ctx.save();ctx.translate(200,200);ctx.scale(0.05,0.05);
        drawBlackHole(ctx,{x:0,y:0},40,HOLE_COLORS.local,2);
        ctx.restore();
        const distantCenter=[...ctx.getImageData(200,200,1,1).data];
        const distantRing=[...ctx.getImageData(202,200,1,1).data];
        document.body.replaceChildren(canvas);
        const game=new Game(canvas);game.start([{id:0,isLocal:true}],'graphics-preview');
        const snapshot=JSON.stringify(game.getFrozenSnapshot());
        game.draw(0,0);game.draw(1000,0);
        const untouched=snapshot===JSON.stringify(game.getFrozenSnapshot());
        return {anchored,farAnchored,stable,starBrightness,center,ring,distantCenter,distantRing,untouched};
      });
      assert(result.anchored,'Stars must move on screen opposite camera movement');
      assert(result.stable,'Stationary camera must have a stationary starfield');
      assert(result.farAnchored,'Large arenas must retain anchored stars');
      assert(result.starBrightness[0]>0.5 && result.starBrightness[1]<result.starBrightness[0] &&
        result.starBrightness[2]<0.03,'Stars must progressively dim to a faint background at arena zoom');
      assert.deepEqual(result.center,[0,0,0,255]);
      assert(result.ring[0]+result.ring[1]+result.ring[2]>30,'Photon ring must be visible');
      // Subpixel antialiasing differs between rasterizers; the tiny center must stay dark and opaque.
      assert(result.distantCenter[3]===255 && result.distantCenter.slice(0,3).every(channel=>channel<=16));
      assert(result.distantRing[3]>0,'Distant-body ring disappeared');
      assert(result.untouched,'Drawing mutated physics state');
      await page.screenshot({path:`.scratch/graphics/${engine.name()}.png`});
      console.log(`PASS ${engine.name()}: anchored stars, black horizon, visible ring, unchanged physics`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
