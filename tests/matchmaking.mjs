import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
const browsers=await Promise.all([chromium,firefox,webkit].map(engine=>engine.launch()));
try {
 const join=async(count,engine)=>{
  const page=await browsers[engine].newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(async()=>{
   const module=fragment=>performance.getEntriesByType('resource').find(e=>e.name.includes(fragment)).name;
   const {Game}=await import(module('/src/Game.ts'));const start=Game.prototype.start;
   const {RollbackNetcode}=await import(module('/netcode/rollback.ts'));const collect=RollbackNetcode.prototype.garbageCollectHistory;
   const {DEFAULT_MULTIPLAYER_SETTINGS,INVITE_SETTINGS_KEY}=await import('/src/solo-settings.ts');
   localStorage.setItem(INVITE_SETTINGS_KEY,JSON.stringify({...DEFAULT_MULTIPLAYER_SETTINGS,shotSpeed:3,gravity:1,aiCount:5}));
   window.defaults=DEFAULT_MULTIPLAYER_SETTINGS;
   window.starts=[];window.confirmed={};
   Game.prototype.start=function(players,seed,settings){start.call(this,players,seed,settings);window.starts.push({ids:players.map(p=>p.id),seed,settings:this.settings});};
   RollbackNetcode.prototype.garbageCollectHistory=function(){for(const state of this.history)if(state.allInputsSynced())window.confirmed[state.frame]=JSON.stringify(state.state);collect.call(this);};
   const WS=window.WebSocket;window.WebSocket=class extends WS {constructor(...args){super(...args);window.signaling=this;}};
  });
  await page.getByRole('button',{name:'Multiplayer',exact:true}).click();
  await page.getByLabel('Total players (including you)').selectOption(String(count));
  await page.getByRole('button',{name:'Matchmaking',exact:true}).click();return page;
 };
 const three=[await join(3,0),await join(3,1)];
 const two=[await join(2,2),await join(2,0)];
 await Promise.all(two.map(p=>p.waitForFunction(()=>window.starts.length===1,null,{timeout:45000})));
 for(const page of three)assert.equal(await page.evaluate(()=>window.starts.length),0,'Wrong-size queue started early');
 three.push(await join(3,2));
 await Promise.all(three.map(p=>p.waitForFunction(()=>window.starts.length===1,null,{timeout:45000})));
 for(const group of [two,three]) {
  const starts=await Promise.all(group.map(p=>p.evaluate(()=>window.starts[0])));
  assert.deepEqual(starts[0].settings,await group[0].evaluate(()=>window.defaults));
  assert.equal(starts[0].ids.length,group.length);for(const start of starts)assert.deepEqual(start,starts[0]);
  await Promise.all(group.map(p=>p.waitForFunction(()=>window.confirmed[60]!==undefined,null,{timeout:30000})));
  const states=await Promise.all(group.map(p=>p.evaluate(()=>window.confirmed[60])));for(const state of states)assert.equal(state,states[0]);
 }
 const cancelled=await join(4,1);await cancelled.getByRole('button',{name:'Cancel matchmaking'}).click();
 await cancelled.waitForFunction(()=>window.signaling.readyState===3);
 assert.equal(await cancelled.evaluate(()=>window.starts.length),0);
 console.log('PASS real free signaling: isolated 2/3-player queues, exact sizes, automatic full-mesh start, identical confirmed states, cancellation');
} finally {await Promise.all(browsers.map(b=>b.close()));await server.close();}
