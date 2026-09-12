import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {initialPopulation,breed,scoreMatch,DEFAULT_AI_GENOME,validateGenome,POPULATION} from './ai-evolution.mjs';
const {values}=parseArgs({options:{generations:{type:'string',default:'20'},seed:{type:'string',default:'graviwar-evolution-1'},out:{type:'string',default:'.scratch/ai-training'},resume:{type:'boolean',default:false}}});
const generations=Number(values.generations),output=values.out;
assert(Number.isInteger(generations)&&generations>=1&&generations<=10000,'generations must be 1–10000');
// A checkpoint cannot silently resume under different physics or training code.
const sourceFiles=(await readdir('src',{recursive:true})).filter(p=>/\.(ts|tsx)$/.test(p)).sort().map(p=>'src/'+p);
sourceFiles.push('scripts/ai-evolution.mjs','scripts/train-ai.mjs','tests/ai-training-simulation.mjs','tests/ai-benchmark-simulation.mjs');
const hash=createHash('sha256');
for(const file of sourceFiles)hash.update(file).update(await readFile(file));
const sourceHash=hash.digest('hex'),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await mkdir(output,{recursive:true});
const checkpointPath=`${output}/checkpoint.json`;
let checkpoint;
if(values.resume){
 checkpoint=JSON.parse(await readFile(checkpointPath,'utf8'));
 assert.equal(checkpoint.version,1);assert.equal(checkpoint.sourceHash,sourceHash,'Source changed; start a new experiment');assert.equal(checkpoint.seed,values.seed,'Seed mismatch');
 assert(Number.isInteger(checkpoint.generation)&&checkpoint.generation>=0&&checkpoint.generation<=generations);
 assert.equal(checkpoint.population.length,POPULATION);checkpoint.population.forEach(validateGenome);
 assert.equal(checkpoint.history.length,checkpoint.generation);checkpoint.history.forEach(h=>validateGenome(h.genome));
}else{
 try{await readFile(checkpointPath);throw Error('Checkpoint already exists: use --resume or a new --out');}catch(error){if(error.code!=='ENOENT')throw error;}
 checkpoint={version:1,sourceHash,commit,seed:values.seed,generation:0,population:initialPopulation(values.seed),history:[]};
}
const save=async(path,value)=>{await writeFile(path+'.tmp',JSON.stringify(value,null,2));await rename(path+'.tmp',path);};
await save(checkpointPath,checkpoint);
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
let browser;
try{
 browser=await chromium.launch();const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const run=async options=>{
  const result=await page.evaluate(async options=>(await import('/tests/ai-training-simulation.mjs')).trainingMatch(options),options);
  return {...result,scores:scoreMatch(result.deaths,result.massSums,result.initialMasses,result.ticks)};
 };
 for(let generation=checkpoint.generation;generation<generations;generation++){
  const matches=[];
  for(let match=0;match<4;match++){
   matches.push(await run({genomes:checkpoint.population,seed:`${values.seed}:train:${generation}`,rotation:match*8}));
   console.log(`Generation ${generation+1}/${generations}, match ${match+1}/4`);
  }
  const scores=checkpoint.population.map((_,i)=>matches.reduce((sum,m)=>sum+m.scores[i].score,0)/matches.length);
  const best=scores.indexOf(Math.max(...scores));
  const champion={generation:generation+1,genome:checkpoint.population[best],score:scores[best]};
  // Keep full generation evidence separate; checkpoint is small and resumable.
  await save(`${output}/generation-${generation+1}.json`,{population:checkpoint.population,matches,scores,champion});
  checkpoint={...checkpoint,generation:generation+1,population:breed(checkpoint.population,scores,`${values.seed}:breed:${generation}`),history:[...checkpoint.history,champion]};
  await save(checkpointPath,checkpoint);
  console.log(`Champion mean fitness ${champion.score.toFixed(2)}`);
 }
 // Fixed held-out seeds, varied arenas; compare latest, current, and an earlier champion.
 const champion=checkpoint.history.at(-1),earlier=checkpoint.history[Math.max(0,Math.floor(checkpoint.history.length/2)-1)];
 const validation=[];
 const variants=[{}, {arenaRadius:5000,bodyCount:60}, {arenaRadius:20000,bodyCount:240}, {gravity:0,arenaRadius:10000}];
 for(let variant=0;variant<variants.length;variant++)for(let rotation=0;rotation<3;rotation++){
  const result=await run({genomes:[champion.genome,DEFAULT_AI_GENOME,earlier.genome],seed:`${values.seed}:holdout:${variant}`,rotation,settingsOverride:variants[variant]});
  validation.push({variant,rotation,...result});
  console.log(`Validation match ${validation.length}/12`);
 }
 const scenarios=['feeding','coasting','guarded','escape-tangent','escape-outward','valuable-chase'];
 const focused=[];
 for(const scenario of scenarios)for(let seed=0;seed<3;seed++)for(const policy of ['candidate','current']){
  const {result}=await page.evaluate(async options=>(await import('/tests/ai-benchmark-simulation.mjs')).simulate(options),{scenario,seed:`${values.seed}:holdout:focus:${seed}`,policy:'current',genome:policy==='candidate'?champion.genome:DEFAULT_AI_GENOME});
  focused.push({...result,policy});
 }
 const summary=['candidate','current','earlier'].map((policy,i)=>({policy,meanScore:validation.reduce((s,m)=>s+m.scores[i].score,0)/validation.length,wins:validation.filter(m=>m.scores[i].winner).length}));
 await save(`${output}/champion.json`,{version:1,sourceHash,commit,...champion});
 await save(`${output}/validation.json`,{summary,validation,focused,earlier,sourceHash});
 let report=`# AI evolution\n\nSeed: ${values.seed}; generations: ${checkpoint.generation}; source: ${commit}.\n\n32 genomes, four rotated matches per generation. Latest champion training fitness: ${champion.score.toFixed(2)}. Training fitness across generations uses different worlds and is not a progress benchmark.\n\nHeld-out matches (12 games; candidate, current AI, earlier champion):\n\n`;
 for(const row of summary)report+=`- ${row.policy}: ${row.meanScore.toFixed(2)} mean fitness; ${row.wins} wins.\n`;
 report+='\nFocused held-out scenarios (mean final mass / initial mass, including deaths):\n\n';
 for(const scenario of scenarios){report+=`- ${scenario}: `;report+=['candidate','current'].map(policy=>{const rows=focused.filter(r=>r.scenario===scenario&&r.policy===policy);return `${policy} ${(rows.reduce((s,r)=>s+r.massRatio,0)/rows.length).toFixed(2)}×, ${rows.filter(r=>r.alive).length}/${rows.length} alive`;}).join('; ')+'.\n';}
 report+='\nNo automatic promotion: inspect validation and repeat on additional held-out seeds before changing the live defaults. Artifacts are local and gitignored.\n';
 await writeFile(`${output}/report.md`,report);console.log(report);
}finally{await browser?.close();await server.close();}
