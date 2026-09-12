import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {DEFAULT_AI_GENOME,validateGenome,scoreMatch} from '../scripts/ai-evolution.mjs';
const manual=validateGenome(JSON.parse(await readFile('tests/fixtures/ai-manual-genome.json','utf8')));
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const totals=[0,0,0],wins=[0,0,0];
 const variants=[{}, {arenaRadius:5000,bodyCount:60},{arenaRadius:20000,bodyCount:240},{gravity:0}];
 for(let variant=0;variant<4;variant++)for(let rotation=0;rotation<3;rotation++){
  const result=await page.evaluate(async options=>(await import('/tests/ai-training-simulation.mjs')).trainingMatch(options),{
   genomes:[DEFAULT_AI_GENOME,manual,manual],seed:`promotion-regression:${variant}`,rotation,settingsOverride:variants[variant],
  });
  scoreMatch(result.deaths,result.massSums,result.initialMasses,result.ticks).forEach((s,i)=>{totals[i]+=s.score;wins[i]+=Number(s.winner);});
 }
 assert(totals[0]>(totals[1]+totals[2])/2,'Evolved AI must outperform the manual profile across rotated matches');
 console.log(`PASS promoted AI: ${wins[0]}/12 wins; mean fitness ${(totals[0]/12).toFixed(2)} vs manual ${((totals[1]+totals[2])/24).toFixed(2)}`);
}finally{await browser.close();await server.close();}
