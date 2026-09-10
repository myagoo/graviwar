import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';

const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();
const traces=[];
try {
  for(const engine of [chromium,firefox,webkit]) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      const result=await page.evaluate(async()=>{
        const {BodyTree}=await import('/src/body-tree.ts');
        const {Game,INITIAL_BODY_COUNT}=await import('/src/Game.ts');
        const {RollbackNetcode}=await import('/src/netplayjs/netcode/rollback.ts');
        const {createRandomGenerator}=await import('/src/utils.ts');
        const {massFromRadius,radiusFromMass,intersectionMass}=await import('/src/mass.ts');
        const check=(condition,message)=>{if(!condition)throw new Error(message);};
        for(const partial of [false,true])for(const reverse of [false,true]) {
          const mass=massFromRadius(80);
          const big={type:'cpu',mass:2*mass,radius:radiusFromMass(2*mass),position:{x:0,y:0},velocity:{x:3,y:-2}};
          const small={type:'cpu',mass,radius:80,position:{x:partial?(big.radius+80)*0.8:0,y:0},velocity:{x:-9,y:8}};
          const bodies=reverse?[small,big]:[big,small];
          const momentum=axis=>bodies.reduce((sum,b)=>sum+b.mass*b.velocity[axis],0);
          const initial={x:momentum('x'),y:momentum('y')};
          for(let tick=0;tick<12;tick++) {
            const previousMass=big.mass, previousVelocity={...big.velocity}, donorMass=small.mass;
            new BodyTree(bodies).absorb();
            const received=donorMass-small.mass;
            for(const axis of ['x','y']) {
              check(Math.abs(momentum(axis)-initial[axis])<1e-7,'Absorption lost momentum');
              const expected=(previousMass*previousVelocity[axis]+received*small.velocity[axis])/(previousMass+received);
              check(Math.abs(big.velocity[axis]-expected)<1e-12,'Absorbed velocity must use transferred mass');
            }
            if(tick===0)check(partial?small.mass>0&&small.mass<mass:small.mass===0,'Incorrect test contact');
          }
          if(!partial)check(Math.abs(big.velocity.x+1)<1e-12,'A 2:1 merge must produce the mass-weighted velocity');
        }
        const make=(count,span=19000)=>{
          const random=createRandomGenerator('spatial-test');
          return Array.from({length:count},(_,i)=>{
            const radius=Math.sqrt(random.range(100,2000)/Math.PI),mass=massFromRadius(radius);
            return {type:i===0?'player':'cpu',...(i===0?{playerId:0}:{}),mass,radius,position:random.vectorFromCenter(span),velocity:{x:0,y:0}};
          });
        };
        const exactGravity=bodies=>{
          for(let i=0;i<bodies.length;i++)for(let j=0;j<bodies.length;j++)if(i!==j){
            const a=bodies[i],b=bodies[j],dx=b.position.x-a.position.x,dy=b.position.y-a.position.y,d2=dx*dx+dy*dy;
            if(!d2)continue;
            const factor=0.1*b.mass/(d2*Math.sqrt(d2));a.velocity.x+=dx*factor;a.velocity.y+=dy*factor;
          }
        };
        const error=(a,b)=>{
          let diff=0,total=0;
          for(let i=0;i<a.length;i++){
            const dx=a[i].velocity.x-b[i].velocity.x,dy=a[i].velocity.y-b[i].velocity.y;
            diff+=dx*dx+dy*dy;total+=b[i].velocity.x*b[i].velocity.x+b[i].velocity.y*b[i].velocity.y;
          }
          return Math.sqrt(diff/total);
        };
        const errors=[];
        for(const span of [19000,500]){
          const initial=make(400,span),exact=structuredClone(initial),precise=structuredClone(initial),approx=structuredClone(initial);
          exactGravity(exact);new BodyTree(precise).applyGravity(0.1,0);new BodyTree(approx).applyGravity(0.1);
          check(error(precise,exact)<1e-12,'Zero theta disagrees with direct gravity');
          const rms=error(approx,exact);errors.push(rms);
          check(rms<0.02,'Approximate gravity exceeds 2% relative RMS error');
        }
        const one=make(1);new BodyTree(one).applyGravity(0.1);
        check(one[0].velocity.x===0&&one[0].velocity.y===0,'Self force');
        const coincident=make(64);coincident.forEach(b=>b.position={x:0,y:0});
        const mass=coincident.reduce((sum,b)=>sum+b.mass,0);
        const tree=new BodyTree(coincident);tree.absorb();tree.applyGravity(0.1);
        check(coincident.every(b=>Number.isFinite(b.velocity.x)&&Number.isFinite(b.radius)),'Coincident bodies caused invalid physics');
        check(Math.abs(coincident.reduce((sum,b)=>sum+b.mass,0)-mass)<1e-8,'Absorption lost mass');

        // Exhaustive collision oracle, including growth that creates new overlaps.
        for(const span of [100,500,19000]){
          const fast=make(160,span),slow=structuredClone(fast);
          new BodyTree(fast).absorb();
          for(let i=0;i<slow.length;i++){
            const a=slow[i];if(a.radius<1)continue;
            for(let j=i+1;j<slow.length;j++){
              const b=slow[j];if(b.radius<1)continue;
              let amount=Math.min(a.mass,b.mass,intersectionMass(a.position,a.radius,b.position,b.radius));
              if(amount<=0)continue;
              const loser=a.radius<b.radius?a:b;
              if(loser.mass-amount<massFromRadius(1))amount=loser.mass;
              const winner=loser===a?b:a;
              for(const axis of ['x','y'])winner.velocity[axis]=(winner.mass*winner.velocity[axis]+amount*loser.velocity[axis])/(winner.mass+amount);
              const transfer=a.radius<b.radius?-amount:amount;
              a.mass+=transfer;b.mass-=transfer;a.radius=radiusFromMass(a.mass);b.radius=radiusFromMass(b.mass);
              if(a.radius<1)break;
            }
          }
          check(Math.abs(fast.reduce((sum,b)=>sum+b.mass,0)-make(160,span).reduce((sum,b)=>sum+b.mass,0))<1e-7,'Partial absorption lost mass');
          check(JSON.stringify(fast)===JSON.stringify(slow),'Quadtree missed or reordered absorption');
        }
        const canvas=document.createElement('canvas');document.body.append(canvas);
        const game=new Game(canvas),players=[{id:0,isLocal:true},{id:1,isLocal:false,conn:{}}];
        game.start(players,'test');check(game.blackHoles.length===INITIAL_BODY_COUNT,'Default body count mismatch');
        const hashes=[];
        for(const count of [1000,5000]){
          const initial=make(count);initial[1].type='player';initial[1].playerId=1;
          game.rollbackToSnapshot(initial);
          const trace=[];
          for(let tick=0;tick<=24;tick++){
            if(tick)game.tick(new Map([[players[0],tick%7===0?{clickDirection:0.7}:undefined]]),tick);
            const state=game.getFrozenSnapshot();
            check(state.every(b=>[b.mass,b.radius,b.position.x,b.position.y,b.velocity.x,b.velocity.y].every(Number.isFinite)),'Nonfinite large-world state');
            const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(state)));
            trace.push([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''));
          }
          hashes.push(trace);
        }
        const initial=make(1000);initial[1].type='player';initial[1].playerId=1;
        game.rollbackToSnapshot(initial);
        const snapshot=game.getFrozenSnapshot();snapshot[0].position.x+=100;
        check(game.blackHoles[0].position.x!==snapshot[0].position.x,'Snapshot aliases live position');
        game.rollbackToSnapshot(initial);initial[0].velocity.x+=1;
        check(game.blackHoles[0].velocity.x!==initial[0].velocity.x,'Restored state aliases snapshot');
        initial[0].velocity.x-=1;
        const netcode=new RollbackNetcode(game,players,()=>{});
        for(let tick=1;tick<=24;tick++)netcode.tick();
        netcode.onRemoteInput(5,players[1],{clickDirection:0.5});
        const rolled=JSON.stringify(game.getFrozenSnapshot());
        game.rollbackToSnapshot(initial);
        for(let tick=1;tick<=24;tick++)game.tick(new Map([[players[1],tick===5?{clickDirection:0.5}:undefined]]),tick);
        check(JSON.stringify(game.getFrozenSnapshot())===rolled,'Large-world rollback failed');
        game.destroy();return {hashes,errors};
      });
      traces.push(result.hashes);
      console.log(`PASS ${engine.name()}: collision oracle, coincident centers, snapshot isolation, 1,000-body rollback; gravity RMS errors ${result.errors.map(e=>(100*e).toFixed(3)+'%').join(', ')}`);
    } finally {await browser.close();}
  }
  for(const trace of traces.slice(1))assert.deepEqual(trace,traces[0],'High-count cross-browser drift');
  console.log('PASS exact cross-browser states: 1,000 and 5,000 bodies over 24 ticks');
} finally {await server.close();}
