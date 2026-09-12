import randomSeed from 'random-seed';
import {AI_GENES, DEFAULT_AI_GENOME, validateGenome} from '../src/ai-genome.ts';
export {DEFAULT_AI_GENOME, validateGenome};
export const POPULATION = 32;

export function randomGenome(random) {
 return Object.fromEntries(Object.entries(AI_GENES).map(([key,[,min,max]])=>[key,min+random.random()*(max-min)]));
}
export function initialPopulation(seed) {
 const random=randomSeed.create(`${seed}:initial`);
 return [{...DEFAULT_AI_GENOME},...Array.from({length:POPULATION-1},()=>randomGenome(random))];
}
export function breed(population, scores, seed) {
 if(population.length!==POPULATION || scores.length!==POPULATION || !scores.every(Number.isFinite)) throw Error('Invalid population scores');
 population.forEach(validateGenome);
 const ranked=population.map((genome,i)=>({genome,score:scores[i],i})).sort((a,b)=>b.score-a.score||a.i-b.i);
 const random=randomSeed.create(seed), next=ranked.slice(0,4).map(p=>({...p.genome}));
 while(next.length<POPULATION-3){
  const a=ranked[random(8)].genome,b=ranked[random(8)].genome;
  next.push(Object.fromEntries(Object.entries(AI_GENES).map(([key,[,min,max]])=>{
   let value=random.random()<0.5?a[key]:b[key];
   if(random.random()<0.2)value+=(random.random()*2-1)*(max-min)*0.1;
   return [key,Math.max(min,Math.min(max,value))];
  })));
 }
 while(next.length<POPULATION)next.push(randomGenome(random));
 return next;
}

// Same-tick deaths share the occupied ranks; timeout survivors also tie.
export function scoreMatch(deaths, massSums, initialMasses, ticks) {
 const count=deaths.length;
 if(count<2||ticks<1||massSums.length!==count||initialMasses.length!==count||
   !deaths.every(d=>d===null||Number.isInteger(d)&&d>=1&&d<=ticks)||
   !massSums.every(m=>Number.isFinite(m)&&m>=0)||!initialMasses.every(m=>Number.isFinite(m)&&m>0))throw Error('Invalid match metrics');
 return deaths.map((death,i)=>{
  const time=death??Infinity;
  const better=deaths.filter(d=>(d??Infinity)>time).length;
  const tied=deaths.filter(d=>(d??Infinity)===time).length;
  const rank=1+better+(tied-1)/2;
  const placement=(count-rank)/(count-1);
  const winner=death===null&&tied===1;
  const growth=Math.max(0,Math.min(2,massSums[i]/ticks/initialMasses[i]))/2;
  return {rank,winner,growth,score:70*placement+25*Number(winner)+5*growth};
 });
}
