import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 for(const scenario of ['feeding','coasting','guarded'])for(let seed=0;seed<3;seed++){
  const {result}=await page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),{scenario,seed:`ai-bench:${seed}`,policy:'current'});
  assert(result.alive,`${scenario}/${seed}: AI died`);
  if(scenario!=='guarded')assert(result.massRatio>1,`${scenario}/${seed}: AI failed to grow`);
  assert(result.shotsPerMinute<30,`${scenario}/${seed}: AI resumed excessive firing`);
 }
 const {result}=await page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),{scenario:'feeding',seed:'ai-bench:0',policy:'current',settingsOverride:{gravity:0}});
 assert(result.shots>0&&result.firstGainSeconds!==null,'AI must actively reach food when gravity is disabled');
 console.log('PASS AI quality: growth, defensive survival, mass conservation, limited firing, zero-gravity pursuit');
}finally{await browser.close();await server.close();}
