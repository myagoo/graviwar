import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const results=await page.evaluate(async () => {
    const {Game}=await import('/src/Game.ts');
    const {createRandomGenerator}=await import('/src/utils.ts');
    const canvas=document.createElement('canvas');document.body.append(canvas);
    const game=new Game(canvas), player={id:0,isLocal:true};game.start([player],'performance');
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const results=[];
    for(const count of [200,1000,5000]) {
      const random=createRandomGenerator('performance-bodies');
      const initial=Array.from({length:count},(_,i)=>{
        const area=i===0?75000:random.range(10000,30000);
        return {type:i===0?'player':'cpu',...(i===0?{playerId:0}:{}),area,radius:Math.sqrt(area/Math.PI),position:random.vectorFromCenter(19500),velocity:{x:0,y:0}};
      });
      const tick=[], snapshot=[], draw=[], overview=[];
      for(let repeat=0;repeat<25;repeat++) {
        game.rollbackToSnapshot(initial);
        let start=performance.now();game.tick(new Map([[player,undefined]]),1);const t=performance.now()-start;
        start=performance.now();game.getFrozenSnapshot();const s=performance.now()-start;
        game.camera.zoomTo(5000);
        start=performance.now();game.draw(0,1);const d=performance.now()-start;
        game.camera.zoomTo(45000);
        start=performance.now();game.draw(0,1);const o=performance.now()-start;
        if(repeat>=5){tick.push(t);snapshot.push(s);draw.push(d);overview.push(o);}
      }
      results.push({count,tickMs:median(tick),snapshotMs:median(snapshot),drawMs:median(draw),overviewMs:median(overview)});
    }
    game.destroy();return results;
  });
  await mkdir('.scratch/performance',{recursive:true});
  const output=process.argv[2] || '.scratch/performance/current.json';
  await writeFile(output,JSON.stringify({browser:browser.version(),results},null,2));
  console.log(JSON.stringify(results,null,2));
  if(process.env.MAX_TICK_MS) assert(results.find(r=>r.count===5000).tickMs<Number(process.env.MAX_TICK_MS),'5,000-body physics exceeds the tick budget');
} finally {await browser.close();await server.close();}
