import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();let reference;
try{for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch();try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const results=await page.evaluate(async()=>{
  const {Game}=await import('/src/Game.ts');const {massFromRadius}=await import('/src/mass.ts');
  const {cos,sin}=await import('/src/deterministic-math.ts');const {shotChargeAt}=await import('/src/shots.ts');
  const cases=[
   {name:'trapped',distance:1400,vx:5,vy:0,radius:600,ticks:300},
   {name:'orbit-left',distance:1400,vx:0,vy:5,radius:600,ticks:600},
   {name:'orbit-right',distance:1400,vx:0,vy:-5,radius:600,ticks:600},
   {name:'early-warning',distance:2200,vx:0,vy:0,radius:600,ticks:600},
   {name:'hunt',distance:2500,vx:0,vy:0,radius:142,ticks:1800},
   {name:'coast',distance:650,vx:4,vy:0,radius:95,ticks:600},
  ];
  const results=[];
  for(const c of cases){
   const game=new Game(document.createElement('canvas'));game.start([],'commitment',{aiCount:1,bodyCount:0,arenaShrinks:false,arenaRadius:10000});
   const self=game.blackHoles[0];self.position={x:0,y:0};self.velocity={x:c.vx,y:c.vy};
   const other={id:'fixture',type:'cpu',radius:c.radius,mass:massFromRadius(c.radius),position:{x:c.distance,y:0},velocity:{x:0,y:c.name==='hunt'?2:0}};
   game.blackHoles.push(other);const shots=[];let frame=0;
   const original=game.expulse.bind(game);game.expulse=(body,direction,radiation,charge=0)=>{
    if(body===self&&!radiation){
     if(charge>shotChargeAt(body.aiChargeTicks*1000/60,game.settings))throw Error('Fired unearned charge');
     const dx=other.position.x-self.position.x,dy=other.position.y-self.position.y,d=Math.sqrt(dx*dx+dy*dy);
     shots.push({frame,charge,towards:(cos(direction)*dx+sin(direction)*dy)/d,recoilY:-sin(direction)});
    }
    original(body,direction,radiation,charge);
   };
   try{for(frame=1;frame<=c.ticks;frame++)game.tick(new Map(),frame);results.push({scenario:c.name,alive:self.mass>0,massRatio:self.mass/massFromRadius(155),shots,state:game.getFrozenSnapshot()});}finally{game.destroy();}
  }
  return results;
 });
 const [trapped,left,right,early,hunt,coast]=results;
 const bursts=r=>r.shots.some((s,i)=>i>0&&s.frame-r.shots[i-1].frame<=15);
 assert(trapped.shots.length>0&&Math.abs(trapped.shots[0].towards)<0.6,'Trapped AI fires into the predator instead of thrusting tangentially');
 assert(bursts(trapped),'Emergency escape never fires a rapid burst');
 for(const escape of [left,right,early])assert(escape.alive,`${escape.scenario}: failed a recoverable gravity escape`);
 assert(left.shots[0].recoilY>0&&right.shots[0].recoilY<0,'Escape reverses existing orbital momentum');
 assert(bursts(hunt)&&hunt.alive&&hunt.massRatio>1.3,'Valuable pursuit must commit and grow');
 assert(hunt.shots.length<10,'Pursuit keeps firing instead of collecting its meal');
 assert(coast.alive&&coast.massRatio>1&&coast.shots.length===0,'Burst logic pushes away incoming food');
 if(reference)assert.deepEqual(results,reference,'Commitment physics differs across browsers');else reference=results;
 console.log(`PASS ${engine.name()}: tangential escapes, preserved momentum, urgent bursts, pursuit growth, incoming-food coasting, exact state`);
}finally{await browser.close();}}}finally{await server.close();}
