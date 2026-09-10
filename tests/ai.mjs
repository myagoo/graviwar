import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';

const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
await server.listen();
let reference;
try {
  for(const engine of [chromium,firefox,webkit]) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      const result=await page.evaluate(async()=>{
        const {Game}=await import('/src/Game.ts');
        const {aiDecision}=await import('/src/ai.ts');
        const aiDirection=(...args)=>aiDecision(...args).clickDirection;
        const {DEFAULT_SOLO_SETTINGS}=await import('/src/solo-settings.ts');
        const {BodyTree}=await import('/src/body-tree.ts');
        const {massFromRadius,radiusFromMass,intersectionMass}=await import('/src/mass.ts');
        const game=new Game(document.createElement('canvas'));
        const body=(radius,x,type='cpu')=>({type,radius,mass:massFromRadius(radius),position:{x,y:0},velocity:{x:0,y:0}});
        for(const radius of [10,80,300])for(const velocity of [{x:0,y:0},{x:17,y:-23}]) {
          const parent=body(radius,0);parent.velocity={...velocity};game.blackHoles=[parent];
          const initialMass=parent.mass;
          for(const direction of [0,Math.PI/2,-0.7]) {
            const previousMass=parent.mass, canExpel=parent.radius>=10;
            game.expulse(parent,direction);
            if(canExpel && Math.abs(game.blackHoles.at(-1).mass/previousMass-0.05)>1e-12)throw new Error('Expulsion must emit 5% of current mass');
            const mass=game.blackHoles.reduce((sum,b)=>sum+b.mass,0);
            if(Math.abs(mass-initialMass)>initialMass*1e-12)throw new Error('Expulsion lost mass');
            for(const axis of ['x','y']) {
              const momentum=game.blackHoles.reduce((sum,b)=>sum+b.mass*b.velocity[axis],0);
              if(Math.abs(momentum-initialMass*velocity[axis])>initialMass*1e-10)throw new Error('Expulsion lost momentum');
            }
          }
        }
        const self=body(80,0,'ai'),food=body(20,500),threat=body(120,300);
        game.blackHoles=[self,food];
        const originalArea=self.mass;
        game.expulse(self,aiDirection(self,game.blackHoles,5000));
        const pursues=self.velocity.x>0 && self.mass<originalArea;
        const conserved=Math.abs(game.blackHoles.reduce((sum,b)=>sum+b.mass,0)-originalArea-food.mass)<1e-8;
        const fleeing=body(80,0,'ai');game.blackHoles=[fleeing,threat];
        game.expulse(fleeing,aiDirection(fleeing,game.blackHoles,5000));
        const flees=fleeing.velocity.x<0;
        const coasting=body(80,0,'ai');coasting.velocity.x=6;
        const coasts=aiDirection(coasting,[coasting,food],5000)===undefined;
        const edge=body(80,4500,'ai');
        game.blackHoles=[edge];game.expulse(edge,aiDirection(edge,[edge],5000));
        const avoidsEdge=edge.velocity.x<0;
        const chooser=body(80,0,'ai'),plain=body(20,500),mystery=body(20,-600);mystery.pickup='jet';
        if(aiDirection(chooser,[chooser,plain,mystery],5000)!==0)throw new Error('AI did not prioritize a reachable bonus');
        chooser.storedBonus='pulse';
        if(Math.abs(aiDirection(chooser,[chooser,plain,mystery],5000)-Math.PI)>1e-12)throw new Error('Full slot still prioritizes replacement');
        if(aiDecision(chooser,[chooser,plain],5000).activateBonus)throw new Error('AI wasted pulse on food');
        if(!aiDecision(chooser,[chooser,threat],5000).activateBonus)throw new Error('AI did not pulse against danger');
        const approaching=body(120,3000);approaching.velocity.x=-100;
        if(aiDecision(chooser,[chooser,approaching],5000).activateBonus)throw new Error('AI pulsed before danger reached its range');
        chooser.storedBonus='supermassive';
        if(aiDecision(chooser,[chooser,threat],5000).activateBonus)throw new Error('AI immobilized itself near danger');
        if(!aiDecision(chooser,[chooser,plain],5000).activateBonus)throw new Error('AI did not use supermassive near food');
        const dangerousFood=body(60,350);
        if(aiDecision(chooser,[chooser,dangerousFood],5000).activateBonus)throw new Error('Supermassive ignored a predator at its half-size radius');
        const crossing=body(100,-2000);crossing.velocity.x=40;
        if(aiDecision(chooser,[chooser,plain,crossing],5000).activateBonus)throw new Error('Supermassive ignored a predator crossing during its duration');
        chooser.storedBonus='pulse';
        const outsideBlast=body(300,1100);
        if(aiDecision(chooser,[chooser,outsideBlast],5000).activateBonus)throw new Error('Pulse used target size instead of its actual range');
        const trapped=body(80,0,'ai'),leftPredator=body(120,-240),rightPredator=body(120,240);
        const escape=aiDirection(trapped,[trapped,leftPredator,rightPredator],5000);
        game.blackHoles=[trapped,leftPredator,rightPredator];game.expulse(trapped,escape);
        if(Math.abs(trapped.velocity.y)<0.5)throw new Error('AI fled one predator straight into another');
        chooser.storedBonus='surge';
        if(!aiDecision(chooser,[chooser,plain],5000).activateBonus)throw new Error('AI did not surge near food');
        chooser.storedBonus='jet';
        if(!aiDecision(chooser,[chooser,threat],5000).activateBonus)throw new Error('AI did not jet away from danger');
        const drifter=body(80,0,'ai');drifter.velocity.y=15;
        game.blackHoles=[drifter,plain];game.expulse(drifter,aiDirection(drifter,game.blackHoles,5000));
        if(drifter.velocity.y>=15)throw new Error('AI failed to correct sideways drift');
        const hunter=body(80,0,'ai'),guarded=body(50,2200),safe=body(20,-600),guard=body(120,2500);
        if(aiDirection(hunter,[hunter,guarded,safe,guard],5000)!==0)throw new Error('AI chose food guarded by a predator');
        const runner=body(30,600);runner.velocity.x=40;
        if(aiDirection(hunter,[hunter,runner,safe],5000)!==0)throw new Error('AI chased unreachable prey over an easy meal');
        const borderFood=body(60,4700);
        if(aiDirection(hunter,[hunter,borderFood,safe],5000)!==0)throw new Error('AI chased food at the closing border');
        const committed=body(80,0,'ai');committed.velocity.x=3;
        const ahead=body(20,650),behind=body(20,-600);
        const course=aiDirection(committed,[committed,ahead,behind],5000);
        if(course!==undefined&&Math.abs(Math.abs(course)-Math.PI)>1e-12)throw new Error('AI reversed course for a marginally closer meal');
        // Analytical inverse-square gravity check, independent of AI behavior.
        const target=body(10,0),source=body(100,1000);
        new BodyTree([target,source]).applyGravity(0.1,0);
        const gravity=target.velocity.x;
        const bigTarget=body(10,0),bigSource=body(200,1000);
        new BodyTree([bigTarget,bigSource]).applyGravity(0.1,0);
        const sphereRatio=bigTarget.velocity.x/gravity;
        const massModel=[1,10,100,300,5000].every(r=>Math.abs(radiusFromMass(massFromRadius(r))-r)<1e-10) &&
          Math.abs(intersectionMass({x:0,y:0},100,{x:0,y:0},50)-massFromRadius(50))<1e-8 &&
          intersectionMass({x:0,y:0},100,{x:300,y:0},100)===0 &&
          Math.abs(intersectionMass({x:0,y:0},100,{x:100,y:0},100)/massFromRadius(100)-5/16)<1e-12;

        const settings={...DEFAULT_SOLO_SETTINGS,bodyCount:80,aiCount:3,arenaShrinks:false};
        game.start([{id:0,isLocal:true}],'ai-replay',settings);
        const initial=game.getFrozenSnapshot();
        const run=()=>{for(let frame=1;frame<=240;frame++)game.tick(new Map(),frame);return game.getFrozenSnapshot();};
        const state=run();game.rollbackToSnapshot(initial);
        const replayed=JSON.stringify(run())===JSON.stringify(state);
        const finite=state.every(b=>[b.mass,b.radius,b.velocity.x,b.velocity.y,b.position.x,b.position.y].every(Number.isFinite));
        game.destroy();
        return {pursues,conserved,flees,coasts,avoidsEdge,gravity,sphereRatio,massModel,replayed,finite,state};
      });
      for(const key of ['pursues','conserved','flees','coasts','avoidsEdge','replayed','finite','massModel'])assert(result[key],`${engine.name()}: ${key}`);
      assert.equal(result.sphereRatio,8);
      assert(Math.abs(result.gravity-0.1*Math.PI*100*100/1000000)<1e-12);
      if(reference)assert.deepEqual(result.state,reference,'AI simulations must match exactly across browsers');
      else reference=result.state;
      console.log(`PASS ${engine.name()}: AI pursuit, escape, coasting, arena avoidance, mass cost, gravity, 240-tick replay`);
    } finally {await browser.close();}
  }
} finally {await server.close();}
