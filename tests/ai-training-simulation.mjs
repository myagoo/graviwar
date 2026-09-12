// Browser-side training uses the same ticks and input/charge path as benchmarks.
export async function trainingMatch({genomes,seed,rotation=0,seconds=90,settingsOverride={},snapshot=false}) {
 const {Game}=await import('/src/Game.ts');
 const {aiDecision}=await import('/src/ai.ts');
 const {validateGenome}=await import('/src/ai-genome.ts');
 genomes.forEach(validateGenome);
 const players=genomes.map((_,id)=>({id,isLocal:false}));
 const game=new Game(document.createElement('canvas'));
 const deaths=genomes.map(()=>null),massSums=genomes.map(()=>0),shots=genomes.map(()=>0),chargedShots=genomes.map(()=>0);
 let ticks=0;
 try {
  game.start(players,seed,{bodyCount:120,aiCount:0,arenaRadius:10000,arenaShrinks:true,shrinkSeconds:seconds,gravity:0.1,...settingsOverride});
  // Rotate genomes over stable spawn slots, keeping the seeded world identical.
  const subjects=players.map(p=>game.blackHoles.find(b=>b.playerId===p.id));
  for(const b of subjects)b.aiChargeTicks=0;
  const initialMasses=subjects.map(b=>b.mass),inputs=new Map();
  for(let frame=1;frame<=seconds*60;frame++) {
   inputs.clear();
   if(frame%30===0)for(const player of players){
    const body=subjects[player.id];
    if(body.mass<=0)continue;
    const input=aiDecision(body,game.blackHoles,game.arenaRadiusAt(frame+60),game.settings,genomes[(player.id+rotation)%genomes.length]);
    inputs.set(player,input);
    if(input.clickDirection!==undefined){shots[player.id]++;if(input.shotCharge>0)chargedShots[player.id]++;}
   }
   game.tick(inputs,frame);ticks=frame;
   for(let i=0;i<subjects.length;i++){
    if(subjects[i].mass<=0&&deaths[i]===null)deaths[i]=frame;
    massSums[i]+=Math.max(0,subjects[i].mass);
   }
   if(deaths.filter(d=>d===null).length<=1)break;
  }
  // Return every statistic in genome order, not spawn order.
  const reorder=values=>genomes.map((_,i)=>values[(i-rotation+genomes.length)%genomes.length]);
  return {deaths:reorder(deaths),massSums:reorder(massSums),initialMasses:reorder(initialMasses),shots:reorder(shots),chargedShots:reorder(chargedShots),ticks,
   ...(snapshot?{snapshot:game.getFrozenSnapshot()}: {})};
 } finally {game.destroy();}
}
