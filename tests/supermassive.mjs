import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
let reference;
try {
 for(const engine of [chromium,firefox,webkit]){
  const browser=await engine.launch();
  try {
   const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
   const result=await page.evaluate(async()=>{
    const {Game}=await import('/src/Game.ts');const {BodyTree}=await import('/src/body-tree.ts');
    const {massFromRadius,bodyRadius,radiusFromMass}=await import('/src/mass.ts');
    const {RollbackNetcode}=await import('/src/netplayjs/netcode/rollback.ts');
    const check=(v,message)=>{if(!v)throw new Error(message);};
    const make=(radius,id)=>({type:'player',playerId:id,radius,mass:massFromRadius(radius),position:{x:0,y:0},velocity:{x:0,y:0}});
    const local={id:0,isLocal:true},remote={id:1,isLocal:false,conn:{}};
    const game=new Game(document.createElement('canvas'));game.start([local],'compression');
    const player=make(100,0);player.storedBonus='supermassive';game.blackHoles=[player];
    const mass=player.mass,curve=[];let saved;
    for(let frame=1;frame<=181;frame++){
     game.tick(new Map([[local,frame===1?{activateBonus:true}:undefined]]),frame);
     curve.push(player.radius);check(player.mass===mass,'Compression changed mass');
     if(frame===61)saved=game.getFrozenSnapshot();
    }
    check(curve[0]===100&&curve[30]===10&&curve[150]===10&&Math.abs(curve[165]-55)<1e-12&&curve[180]===100,'Incorrect 0.5s in / 2s hold / 0.5s out curve');
    check(curve.slice(1,31).every((r,i)=>r<curve[i]),'Shrink was not monotonic');
    check(curve.slice(151).every((r,i)=>r>curve[150+i]),'Expansion was not monotonic');
    const final=game.getFrozenSnapshot();game.rollbackToSnapshot(saved);
    for(let frame=62;frame<=181;frame++)game.tick(new Map(),frame);
    check(JSON.stringify(final)===JSON.stringify(game.getFrozenSnapshot()),'Snapshot restore lost compression state');
    const heavy=make(100,0);heavy.activeBonus='supermassive';heavy.bonusTicks=120;heavy.radius=bodyRadius(heavy);
    const snack=make(5,1),total=heavy.mass+snack.mass;
    new BodyTree([snack,heavy]).absorb();
    check(snack.mass===0&&heavy.mass===total&&heavy.radius===bodyRadius(heavy),'Eating reset compressed radius or changed mass');
    game.blackHoles=[heavy];
    for(let frame=1;frame<=120;frame++)game.tick(new Map(),frame);
    check(heavy.radius===radiusFromMass(total)&&heavy.mass===total,'Expansion forgot absorbed mass');
    const compressed=make(100,0);compressed.activeBonus='supermassive';compressed.bonusTicks=120;compressed.radius=bodyRadius(compressed);
    const larger=make(200,1),sum=compressed.mass+larger.mass;
    new BodyTree([compressed,larger]).absorb();
    check(compressed.mass===0&&Math.abs(larger.mass-sum)<1e-7,'Compressed donor density lost mass on full absorption');
    const tiny=make(5,0);tiny.storedBonus='supermassive';game.blackHoles=[tiny];
    for(let frame=1;frame<=61;frame++)game.tick(new Map([[local,frame===1?{activateBonus:true}:undefined]]),frame);
    check(game.blackHoles.length===1&&tiny.radius===0.5&&tiny.mass===massFromRadius(5),'Compression deleted a live tiny body');
    game.start([local,remote],'late-compression');game.blackHoles=[make(100,0),make(100,1)];
    game.blackHoles[1].position.x=10000;game.blackHoles[1].storedBonus='supermassive';
    const initial=game.getFrozenSnapshot(),netcode=new RollbackNetcode(game,[local,remote],()=>{});
    for(let frame=1;frame<=170;frame++)netcode.tick();netcode.onRemoteInput(5,remote,{activateBonus:true});
    const rolled=game.getFrozenSnapshot();game.rollbackToSnapshot(initial);
    for(let frame=1;frame<=170;frame++)game.tick(new Map([[remote,frame===5?{activateBonus:true}:undefined]]),frame);
    check(JSON.stringify(rolled)===JSON.stringify(game.getFrozenSnapshot()),'Late remote activation diverged during expansion');
    game.destroy();return {curve,rolled};
   });
   if(reference)assert.deepEqual(result,reference,'Compression differs across engines');else reference=result;
   console.log(`PASS ${engine.name()}: 180-tick compression, preserved mass, density, tiny-body survival, snapshot and late-input rollback`);
  }finally{await browser.close();}
 }
}finally{await server.close();}
