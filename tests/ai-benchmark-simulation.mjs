// Browser-side benchmark: real ticks, no rendering or wall-clock scheduling.
export async function simulate({scenario, policy, seed, seat=0, seconds, trace=false, decisionPath="/src/ai.ts", opponentPath=decisionPath, settingsOverride={}, genome}) {
 const {Game}=await import('/src/Game.ts');
 const {aiDecision}=await import(/* @vite-ignore */ decisionPath);
 const {aiDecision:opponentDecision}=await import(/* @vite-ignore */ opponentPath);
 const {massFromRadius}=await import('/src/mass.ts');
 const {createRandomGenerator}=await import('/src/utils.ts');
 const random=createRandomGenerator(seed);
 const match=scenario==='match', duration=seconds??(match?90:30);
 const settings={bodyCount:match?120:0,aiCount:0,arenaRadius:10000,arenaShrinks:match||scenario==='shrinking',shrinkSeconds:90,gravity:0.1,...settingsOverride};
 const players=Array.from({length:match?3:1},(_,id)=>({id,isLocal:id===seat}));
 const game=new Game(document.createElement('canvas'));
 game.start(players,seed,settings);
 for (const body of game.blackHoles) if (body.playerId!==undefined) body.aiChargeTicks=0;
 const body=(radius,x,y=0,vx=0,vy=0)=>({id:`fixture:${game.blackHoles.length}`,type:'cpu',radius,mass:massFromRadius(radius),position:{x,y},velocity:{x:vx,y:vy}});
 const add=(...args)=>game.blackHoles.push(body(...args));
 if(!match){
  const self=game.blackHoles[0];self.position={x:0,y:0};self.velocity={x:0,y:0};
  // Seeded perturbations prevent a single perfectly aligned fixture becoming the objective.
  const offset=random.range(-30,30);
  if(scenario==='valuable-chase'){add(142,2500,offset,0,2);add(35,-500,offset);}
  if(scenario==='valuable-prey'){add(142,1100,offset,1,0);add(35,-500,offset);}
  if(scenario==='coasting'){self.velocity.x=4;add(95,650,offset);}
  if(scenario==='feeding')for(let i=0;i<8;i++)add(80,450+i*190,offset+(i%2)*100);
  if(scenario==='moving'){add(95,650,offset,1.5,1);add(35,-500,offset);}
  if(scenario==='guarded'){add(100,850,offset);add(240,1150,offset);add(80,-650,offset);}
  if(scenario.startsWith('escape-')){self.velocity=scenario==='escape-tangent'?{x:0,y:10}:scenario==='escape-outward'?{x:-8,y:3}:{x:8,y:0};add(240,500,offset,-2,0);}
  if(scenario==='shrinking'){self.position.x=8000;self.velocity.x=5;add(90,6500,offset);}
 }
 const subject=game.blackHoles.find(b=>b.playerId===seat), initialMass=subject.mass, initialRadius=subject.radius;
 let shots=0,expelled=0,radiated=0,gained=0,lost=0,peakMass=initialMass,firstGain=null,death=null,winner=null,frame=0;
 const frames=[],inputs=new Map();
 const originalExpulse=game.expulse.bind(game);
 game.expulse=(b,...args)=>{const before=b.mass;originalExpulse(b,...args);if(b===subject&&b.mass<before){if(args[1])radiated+=before-b.mass;else {shots++;expelled+=before-b.mass;}}};
 const decide=(b,kind)=>{
  if(kind==='passive')return undefined;
  if(kind==='current')return (b.playerId===seat?aiDecision:opponentDecision)(b,game.blackHoles,game.arenaRadiusAt(frame+60),game.settings,b.playerId===seat?genome:undefined);
  let food,distance=Infinity;
  for(const other of game.blackHoles){if(other===b||other.radius>=b.radius||other.type==='fluctuation')continue;const d=(other.position.x-b.position.x)**2+(other.position.y-b.position.y)**2;if(d<distance){distance=d;food=other;}}
  if(!food)return undefined;
  return {clickDirection:Math.atan2(b.position.y-food.position.y,b.position.x-food.position.x)};
 };
 const sample=()=>{if(trace)frames.push({frame,arena:game.arenaRadiusAt(frame),bodies:game.getFrozenSnapshot()});};
 sample();
 try{
  for(frame=1;frame<=duration*60;frame++){
   inputs.clear();
   if(frame%30===0)for(const player of players){const b=game.blackHoles.find(b=>b.playerId===player.id);if(b)inputs.set(player,decide(b,player.id===seat?policy:'current'));}
   const before=subject.mass,emitted=expelled+radiated;
   game.tick(inputs,frame);
   const transfer=subject.mass-before+(expelled+radiated-emitted);
   gained+=Math.max(0,transfer);lost+=Math.max(0,-transfer);
   if(firstGain===null&&transfer>initialMass*0.001)firstGain=frame/60;
   peakMass=Math.max(peakMass,subject.mass);
   if(death===null&&subject.mass<=0)death=frame/60;
   if(frame%60===0)sample();
   if(match){const survivors=game.blackHoles.filter(b=>b.playerId!==undefined);if(survivors.length<=1){winner=survivors[0]?.playerId??null;break;}}
  }
  const elapsed=Math.min(frame,duration*60)/60;
  const result={scenario,policy,seed,seat,seconds:elapsed,alive:death===null,survivalSeconds:death??elapsed,win:match?winner===seat:null,resolved:match?winner!==null:null,
   massRatio:subject.mass/initialMass,radiusRatio:subject.mass>0?subject.radius/initialRadius:0,peakMassRatio:peakMass/initialMass,
   absorbedRatio:gained/initialMass,lostRatio:lost/initialMass,expelledRatio:expelled/initialMass,radiatedRatio:radiated/initialMass,
   shots,shotsPerMinute:shots/((death??elapsed)/60),firstGainSeconds:firstGain};
  for(const value of Object.values(result))if(typeof value==='number'&&!Number.isFinite(value))throw Error('Non-finite benchmark metric');
  // Accounting check catches broken instrumentation, including death and radiation.
  if(Math.abs(initialMass+gained-lost-expelled-radiated-subject.mass)>initialMass*1e-8)throw Error('Mass accounting mismatch');
  return {result,frames,final:game.getFrozenSnapshot()};
 } finally {game.destroy();}
}
