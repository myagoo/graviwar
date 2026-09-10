import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
const engines = process.env.BROWSERS ? process.env.BROWSERS.split(',').map(name => ({chromium,firefox,webkit}[name])) : [chromium, firefox, webkit];
const browsers = [];
const pages = [], errors = [];
await mkdir('.scratch/netcode', { recursive: true });
try {
  const traces = [];
  for (const engine of engines) {
    const browser = await engine.launch();
    browsers.push(browser);
    if (process.env.LOBBY_ONLY) continue;
    const page = await browser.newPage(); await page.goto(base);
    page.on('pageerror', error => errors.push(error.message));
    assert.deepEqual(await page.getByRole('button').allTextContents(), ['Solo', 'Multiplayer']);
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(e => e.name.includes('/src/Game.ts')).name;
      const { Game } = await import(url);
      const tick = Game.prototype.tick, expulse = Game.prototype.expulse;
      window.soloTicks = 0; window.expulsions = [];
      Game.prototype.tick = function(...args) { window.soloTicks++; return tick.apply(this, args); };
      Game.prototype.expulse = function(body, direction) {
        const before = body.mass;
        expulse.call(this, body, direction);
        window.expulsions.push({ before, after: body.mass, projectile: this.blackHoles.at(-1).mass });
      };
    });
    for (let run = 0; run < 2; run++) {
      await page.getByRole('button', { name: 'Solo', exact: true }).click();
      await page.getByRole('button', { name: 'Start solo game', exact: true }).click();
      await page.locator('canvas').click({ position: { x: 500, y: 300 } });
      await page.waitForFunction(count => window.expulsions.length > count, run);
      const shot = await page.evaluate(() => window.expulsions.at(-1));
      assert.equal(shot.after, shot.before - shot.projectile);
      assert.equal(shot.projectile, shot.before / 20);
      if(await page.getByRole('button',{name:'Game menu',exact:true}).count())await page.getByRole('button',{name:'Game menu',exact:true}).click();
      await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
      const stopped = await page.evaluate(() => window.soloTicks);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.soloTicks), stopped, 'Solo keeps ticking after leaving');
      assert.equal(await page.locator('canvas:not(.home-stars)').count(), 0);
    }
    // Reload to remove the solo instrumentation before physics checks.
    await page.reload();
    const result = await page.evaluate(async () => {
      const { Game } = await import('/src/Game.ts');
      const { RollbackNetcode } = await import('/src/netplayjs/netcode/rollback.ts');
      const math = await import('/src/deterministic-math.ts');
      const { MatchmakingClient } = await import('/src/netplayjs/matchmaking/client.ts');
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const registration = { onRegistered: { emit() {} } };
      MatchmakingClient.prototype.onServerMessage.call(registration, {
        kind: 'registration-success', clientID: 'test',
        iceServers: [{ urls: ['stun:127.0.0.1:3478', 'turn:127.0.0.1:3478?transport=udp', 'turn:127.0.0.1:3478?transport=tcp'], username: 'test', credential: 'test' }],
      });
      check(registration.iceServers.some(s => s.urls === 'turn:127.0.0.1:3478'), 'Default UDP TURN endpoint lost');
      const connection = new RTCPeerConnection({ iceServers: registration.iceServers }); connection.close();
      const create = (players, seed = 'netcode-repro') => {
        const canvas = document.createElement('canvas'); document.body.append(canvas);
        const game = new Game(canvas); game.start(players, seed); return game;
      };
      const players = local => ['a', 'b', 'c'].map((id, i) => ({ id, isLocal: i === local, conn: {} }));
      const allTraces = [];
      for (const seed of ['netcode-repro', 'overlaps-and-expulsions', 'third-seed']) {
        const ps = players(0), game = create(ps, seed), states = [JSON.stringify(game.getFrozenSnapshot())];
        for (let frame = 1; frame <= 240; frame++) {
          game.tick(new Map(ps.map((p, i) => [p, frame % (7 + i) === 0 ? { clickDirection: (i - 1) * 1.1 } : undefined])), frame);
          const state = game.getFrozenSnapshot();
          check(state.every(b => [b.mass,b.radius,b.position.x,b.position.y,b.velocity.x,b.velocity.y].every(Number.isFinite)), 'Non-finite physics');
          states.push(JSON.stringify(state));
        }
        game.destroy(); allTraces.push(states);
      }
      const perspectives = [];
      for (let local = 0; local < 3; local++) {
        const ps = players(local), game = create(ps);
        // Different Map insertion orders must not change simulation ordering.
        game.tick(new Map(ps.map((p,i) => [p, { clickDirection: i + 0.1 }]).reverse()), 1);
        perspectives.push(JSON.stringify(game.getFrozenSnapshot())); game.destroy();
      }
      check(perspectives.every(s => s === perspectives[0]), 'Three-player ownership drift');
      const ps = players(0), expected = create(ps), actual = create(ps);
      const netcode = new RollbackNetcode(actual, ps, () => {});
      netcode.onRemoteInput(5, ps[1], {clickDirection:0.5});
      for (let frame = 1; frame <= 12; frame++) {
        expected.tick(new Map(ps.map((p,i) => [p, i===1 && frame===5 ? {clickDirection:0.5} : undefined])), frame);
        netcode.tick();
        check(JSON.stringify(expected.getFrozenSnapshot()) === JSON.stringify(actual.getFrozenSnapshot()), `Future input applied on wrong tick ${frame}`);
      }
      netcode.onRemoteInput(4, ps[2], {clickDirection:-0.3});
      const replay = create(ps);
      for (let frame=1;frame<=12;frame++) replay.tick(new Map(ps.map((p,i)=>[p,i===1&&frame===5?{clickDirection:0.5}:i===2&&frame===4?{clickDirection:-0.3}:undefined])),frame);
      check(JSON.stringify(replay.getFrozenSnapshot()) === JSON.stringify(actual.getFrozenSnapshot()), 'Late input rollback differs from uninterrupted play');
      const predictionLimit = netcode.history[0].frame + 180;
      for(let i=0;i<300;i++) netcode.tick();
      check(netcode.currentFrame() === predictionLimit, 'Prediction history did not stop at its bound');
      netcode.onRemoteSync(predictionLimit,ps[1]); netcode.onRemoteSync(predictionLimit,ps[2]); netcode.tick();
      check(netcode.currentFrame() === predictionLimit + 1, 'Prediction did not resume after synchronization');
      expected.destroy(); actual.destroy(); replay.destroy();
      const restored = create(players(2));
      const initial = restored.getFrozenSnapshot();
      restored.rollbackToSnapshot(initial.slice(1));
      restored.rollbackToSnapshot(initial);
      check(restored.localBlackHoleIndex === 2, 'Rollback did not restore local body index'); restored.destroy();
      const quiet = new RollbackNetcode({ getFrozenSnapshot: () => [], flushInputBuffer: () => undefined, tick() {} }, ps, () => {});
      quiet.onRemoteSync(180, ps[1]); quiet.onRemoteSync(180, ps[2]);
      for (let i=0;i<181;i++) quiet.tick();
      check(quiet.currentFrame() === 181, 'Confirmed history falsely exhausted prediction budget');
      check(quiet.history.length <= 2, 'Confirmed history was not collected during forward play');
      const paced = new RollbackNetcode({ getFrozenSnapshot: () => [], flushInputBuffer: () => undefined, tick() {} }, ps, () => {});
      paced.onRemoteSync(240, ps[1]); paced.onRemoteSync(240, ps[2]);
      for (let i=0;i<60;i++) paced.pacedTick();
      check(paced.currentFrame() === 70, 'Quiet-peer catch-up is missing or exceeds its bound');

      const balanced = new RollbackNetcode({ getFrozenSnapshot: () => [], flushInputBuffer: () => undefined, tick() {} }, ps, () => {});
      for(let i=0;i<36;i++) balanced.tick();
      for(let i=0;i<60;i++) {
        const frame=balanced.currentFrame();
        balanced.queueRemoteInput(frame-18,ps[1],undefined,frame-36);
        balanced.queueRemoteInput(frame-18,ps[2],undefined,frame-36);
        balanced.pacedTick();
      }
      check(balanced.currentFrame()===96,'Symmetric latency slowed equal-speed peers');

      // Three independently paced simulations, ordered jitter/bursts, and a paused browser.
      const games = [0,1,2].map(i => create(players(i), 'delivery-schedule'));
      const rosters = [0,1,2].map(players), channels = Array.from({length:3}, () => Array.from({length:3}, () => []));
      let wall = 0;
      const inputAt = (frame, player) => frame > 100 && frame % (17 + player) === 0 ? {clickDirection:player-1} : undefined;
      const codes = games.map((game, sender) => new RollbackNetcode(game, rosters[sender], (frame, input) => {
        for(let receiver=0;receiver<3;receiver++) if(receiver!==sender) {
          const channel = channels[sender][receiver];
          const due = Math.max(channel.at(-1)?.due ?? 0, Math.ceil((wall + (sender*7+receiver*3+wall)%13)/20)*20);
          channel.push({ frame, input, due });
        }
      }));
      games.forEach((game,i) => { game.flushInputBuffer = () => inputAt(codes[i].currentFrame()+1,i); });
      for(wall=0;wall<1600 && codes.some(c=>c.currentFrame()<240);wall++) {
        for(let receiver=0;receiver<3;receiver++) {
          if(receiver===1 && wall>=60 && wall<220) continue;
          for(let sender=0;sender<3;sender++) {
            const channel = channels[sender][receiver];
            while(channel[0]?.due<=wall) {
              const message=channel.shift();
              codes[receiver].queueRemoteInput(message.frame,rosters[receiver][sender],message.input);
            }
          }
          codes[receiver].flushRemoteInputs();
          // One callback can catch up by two ticks; stop exactly at the reference horizon.
          if(codes[receiver].currentFrame()<239) codes[receiver].pacedTick();
          else if(codes[receiver].currentFrame()===239) codes[receiver].tick();
        }
      }
      check(codes.every(c=>c.currentFrame()===240), 'Uneven/paused peers did not recover');
      for(let receiver=0;receiver<3;receiver++) {
        for(let sender=0;sender<3;sender++) if(sender!==receiver) {
          for(const message of channels[sender][receiver]) codes[receiver].queueRemoteInput(message.frame,rosters[receiver][sender],message.input);
          codes[receiver].queueRemoteInput(240,rosters[receiver][sender]);
        }
        codes[receiver].flushRemoteInputs();
      }
      const reference = create(ps, 'delivery-schedule');
      for(let frame=1;frame<=240;frame++) reference.tick(new Map(ps.map((p,i)=>[p,inputAt(frame,i)])),frame);
      for(const game of games) {
        check(JSON.stringify(game.getFrozenSnapshot())===JSON.stringify(reference.getFrozenSnapshot()), 'Burst/pause recovery diverged from reference');
        game.destroy();
      }
      reference.destroy();

      const batchGame=create(ps), batch=new RollbackNetcode(batchGame,ps,()=>{});
      for(let i=0;i<12;i++) batch.tick();
      let rewinds=0;
      const restore=batchGame.rollbackToSnapshot.bind(batchGame);
      batchGame.rollbackToSnapshot = state => { rewinds++; restore(state); };
      batch.queueRemoteInput(4,ps[1],{clickDirection:0.5});
      batch.queueRemoteInput(7,ps[1],{clickDirection:0.2});
      batch.queueRemoteInput(3,ps[2],{clickDirection:-0.5});
      batch.flushRemoteInputs();
      check(rewinds===1,'A delivery burst caused multiple rewinds');
      batchGame.destroy();

      const { DesyncDetector } = await import('/src/netplayjs/netcode/desync.ts');
      const reports=[], hashes=[];
      const detector=new DesyncDetector((frame,hash)=>hashes.push({frame,hash}),report=>reports.push(report),{seed:'test',players:['a','b']});
      detector.record('a',1,{clickDirection:0});
      await detector.checkpoint(0,initial);
      detector.receive('b',0,hashes[0].hash);
      check(reports.length===0,'Equal checkpoint reported a desync');
      detector.receive('b',60,'0'.repeat(64));
      await detector.checkpoint(60,initial);
      check(reports.length===1 && reports[0].frame===60 && reports[0].inputs.length===1,'Mismatch report missing evidence');
      detector.destroy();
      let maxError=0;
      for(let i=0;i<=2000;i++){
        const angle=-2*Math.PI+i*4*Math.PI/2000;
        maxError=Math.max(maxError,Math.abs(math.sin(angle)-Math.sin(angle)),Math.abs(math.cos(angle)-Math.cos(angle)),Math.abs(math.acos(i/1000-1)-Math.acos(i/1000-1)));
      }
      check(maxError < 2e-14, `Math accuracy regression ${maxError}`);
      return allTraces;
    });
    traces.push(result);
    await page.goto(`${base}/?replay`);
    await page.getByRole('button', { name: 'Run self-check', exact: true }).click();
    await page.getByText('SELF-CHECK PASS: clean replay matched 12 ticks; injected position mismatch stopped at tick 6', { exact: true }).waitFor();
    await page.close();
    console.log(`PASS ${engine.name()}: solo/restart, physics, ownership, future input, rollback, pacing/bursts/pause, desync, math accuracy`);
  }
  for(let browser=1;browser<traces.length;browser++) for(let seed=0;seed<traces[0].length;seed++) for(let tick=0;tick<traces[0][seed].length;tick++) {
    assert.equal(traces[browser][seed][tick], traces[0][seed][tick], `Cross-browser drift: ${engines[browser].name()}, seed ${seed}, tick ${tick}`);
  }
  if(traces.length) console.log('PASS cross-browser: three seeds, 240 ticks each, exact state comparison');

  async function join(url, index) {
    const page = await browsers[index % browsers.length].newPage();
    page.on('pageerror', error => errors.push(error.message));
    const target = new URL(url); target.searchParams.delete('wrapper'); await page.goto(target.href);
    await page.evaluate(async index => {
      // Import the actual Vite module URLs, including HMR versions, before instrumenting.
      const module = fragment => performance.getEntriesByType('resource').find(e => e.name.includes(fragment)).name;
      const { Game } = await import(module('/src/Game.ts'));
      const { RollbackNetcode } = await import(module('/netcode/rollback.ts'));
      const { PeerConnection } = await import(module('/matchmaking/peerconnection.ts'));
      const start = Game.prototype.start, startNetcode = RollbackNetcode.prototype.start;
      const collect = RollbackNetcode.prototype.garbageCollectHistory, send = PeerConnection.prototype.send;
      window.starts = []; window.confirmed = {}; window.rollbacks = 0; window.connections = []; window.sentInputs = [];
      Game.prototype.start = function(players, seed) { start.call(this,players,seed); for(const body of this.blackHoles)if(body.type==='player')body.storedBonus='supermassive'; window.game=this; window.starts.push({ids:players.map(p=>p.id),seed}); };
      RollbackNetcode.prototype.start = function() { window.netcode=this; startNetcode.call(this); };
      RollbackNetcode.prototype.garbageCollectHistory = function() {
        for(const state of this.history) if(state.allInputsSynced()) window.confirmed[state.frame] = JSON.stringify(state.state);
        collect.call(this);
      };
      const rollback = Game.prototype.rollbackToSnapshot;
      Game.prototype.rollbackToSnapshot = function(snapshot) { window.rollbacks++; rollback.call(this,snapshot); };
      PeerConnection.prototype.send = function(data) {
        if(!window.connections.includes(this))window.connections.push(this);
        // Fixed delay per sender preserves channel ordering and forces real rollback.
        if(data.type==='input') {
          window.sentInputs.push(data);
          setTimeout(()=>send.call(this,data),40*(index+1));
        }
        else send.call(this,data);
      };
    }, index);
    await page.getByRole('button',{name:'Multiplayer'}).click(); pages.push(page); return page;
  }
  const first = await join(`${base}/#server=${encodeURIComponent(process.env.SIGNALING_URL || 'https://netplayjs.varunramesh.net')}`,0);
  const invite = first.getByRole('link',{name:'Invite link'}); await invite.waitFor();
  const invitation = await invite.getAttribute('href');
  await join(invitation,1);
  // Join through the second peer to prove invitations do not depend on a master.
  await pages[1].getByRole('link',{name:'Invite link'}).waitFor();
  await join(await pages[1].getByRole('link',{name:'Invite link'}).getAttribute('href'),2);
  await join(invitation,3);
  try {
    await Promise.all(pages.map(p=>p.getByText('Players: 4 · Ready: 0',{exact:true}).waitFor({timeout:15000})));
    await Promise.all(pages.map(p=>p.getByText('All peer connections open',{exact:true}).waitFor({timeout:30000}))); 
  } catch (error) {
    console.error('Startup diagnostics', JSON.stringify(await Promise.all(pages.map(p=>p.evaluate(()=>({text:document.body.innerText,connections:window.connections.map(c=>c.closed?{peer:c.peerID,state:'closed'}:({peer:c.peerID,state:c.peerConnection.connectionState,ice:c.peerConnection.iceConnectionState,channel:c.dataChannel?.readyState,signaling:c.peerConnection.signalingState,local:c.peerConnection.localDescription?.type,remote:c.peerConnection.remoteDescription?.type,localCandidates:c.peerConnection.localDescription?.sdp.split('\r\n').filter(l=>l.startsWith('a=candidate')).map(l=>{const t=l.split(' ');return {protocol:t[2],addressType:t[4].includes('.local')?'mdns':t[4].includes(':')?'ipv6':'ipv4',kind:t[7]}}),remoteCandidates:c.peerConnection.remoteDescription?.sdp.match(/a=candidate/g)?.length}))}))))), 'page errors', errors);
    throw error;
  }

  for(const page of pages) await page.getByRole('button',{name:'Ready',exact:true}).click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.starts.length===1)));
  const starts = await Promise.all(pages.map(p=>p.evaluate(()=>window.starts)));
  for(const start of starts) {assert.equal(start[0].ids.length,4);assert.deepEqual(start,starts[0]);}
  await Promise.all(pages.map(page=>page.getByRole('button',{name:'Use Supermassive · Space',exact:true}).click()));
  for(let turn=0;turn<3;turn++) for(const page of pages) await page.locator('canvas').click({position:{x:500,y:300}});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.confirmed[180]!==undefined,{},{timeout:20000})));
  await pages[0].screenshot({ path: '.scratch/netcode/four-player-match.png' });
  const records = await Promise.all(pages.map(p=>p.evaluate(()=>({confirmed:window.confirmed,rollbacks:window.rollbacks,peers:window.connections.filter(c=>!c.closed).length}))));
  for(let tick=1;tick<=180;tick++)for(let peer=1;peer<records.length;peer++)assert.equal(records[peer].confirmed[tick],records[0].confirmed[tick],`Live peer ${peer} diverged at confirmed tick ${tick}`);
  assert(records.every(r=>r.rollbacks>0 && r.peers===3),JSON.stringify(records.map(({rollbacks,peers})=>({rollbacks,peers}))));
  for(const page of pages)assert(await page.evaluate(()=>window.sentInputs.some(message=>message.input?.activateBonus)),'Bonus input was not sent over WebRTC');
  assert(Object.values(records[0].confirmed).some(state=>JSON.parse(state).some(body=>body.activeBonus==='supermassive')),'No confirmed bonus activation');
  console.log('PASS four mixed-browser peers: full mesh, equal roster/seed, delayed inputs, 180 identical confirmed ticks');
  // Suspend one browser's simulation callbacks while its network keeps receiving.
  const pausedFrame = await pages[2].evaluate(() => { window.netcode.destroy(); return window.netcode.currentFrame(); });
  await pages[0].waitForFunction(frame => window.netcode.currentFrame() >= frame + 45, pausedFrame, {timeout:10000});
  for (const page of pages) await page.locator('canvas').click({position:{x:450,y:300}});
  await pages[2].evaluate(() => window.netcode.start());
  const recoveryFrame = Math.ceil((pausedFrame+180)/60)*60;
  await Promise.all(pages.map(p=>p.waitForFunction(frame=>window.confirmed[frame]!==undefined,recoveryFrame,{timeout:20000})));
  const recovered = await Promise.all(pages.map(p=>p.evaluate(frame=>window.confirmed[frame],recoveryFrame)));
  assert(recovered.every(state=>state===recovered[0]),'Live pause recovery diverged');
  console.log('PASS live browser suspension: queued input burst recovers to identical confirmed state');

  await pages[0].close();
  await Promise.all(pages.slice(1).map(p=>p.getByRole('status').filter({hasText:'peer disconnected'}).waitFor({timeout:30000}))); 
  const stopped=await Promise.all(pages.slice(1).map(p=>p.evaluate(()=>window.netcode.currentFrame())));
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.deepEqual(await Promise.all(pages.slice(1).map(p=>p.evaluate(()=>window.netcode.currentFrame()))),stopped);
  assert.deepEqual(errors,[]);
  console.log('PASS disconnect: remaining peers stop instead of silently diverging');
  const matched = [await join(`${base}/#server=${encodeURIComponent(process.env.SIGNALING_URL || 'https://netplayjs.varunramesh.net')}`, 0),
    await join(`${base}/#server=${encodeURIComponent(process.env.SIGNALING_URL || 'https://netplayjs.varunramesh.net')}`, 1)];
  for (const page of matched) { await page.getByRole('button', { name: 'Matchmaking', exact: true }).click(); await page.getByRole('button', { name: 'Find match', exact: true }).click(); }
  await Promise.all(matched.map(p => p.waitForFunction(() => window.starts.length === 1)));
  assert.deepEqual(await matched[0].evaluate(() => window.starts), await matched[1].evaluate(() => window.starts));
  assert.deepEqual(errors, []);
  console.log('PASS public matchmaking: equal roster/seed without duplicate offers');
  // Corrupt a transmitted checkpoint to exercise the real wire/UI/report path.
  await matched[0].evaluate(() => {
    for (const connection of window.connections) {
      const send=connection.send.bind(connection);
      connection.send=data=>send(data.type==='checksum' && data.frame>=60?{...data,hash:'0'.repeat(64)}:data);
    }
  });
  const reportLink=matched[1].getByRole('link',{name:'Download desync report'});
  await reportLink.waitFor({timeout:15000});
  const report=await matched[1].evaluate(async () => {
    const link=[...document.querySelectorAll('a')].find(a=>a.textContent==='Download desync report');
    return (await fetch(link.href)).json();
  });
  assert.notEqual(report.localHash,report.remoteHash);
  assert(report.checkpoints.length>0 && report.inputs.length>0 && report.players.length===2);
  const halted=await matched[1].evaluate(()=>window.netcode.currentFrame());
  await matched[1].waitForTimeout(100);
  assert.equal(await matched[1].evaluate(()=>window.netcode.currentFrame()),halted);
  assert.deepEqual(errors,[]);
  console.log('PASS runtime desync: mismatch stops play and offers checkpoint/input evidence');

} catch (error) {
  const evidence = [];
  for (const [index, page] of pages.entries()) {
    if (page.isClosed()) continue;
    await page.screenshot({ path: `.scratch/netcode/failure-peer-${index}.png` }).catch(() => {});
    evidence.push(await page.evaluate(() => ({
      browser: navigator.userAgent, starts: window.starts, inputs: window.sentInputs,
      confirmed: window.confirmed, text: document.body.innerText,
    })).catch(() => ({ unavailable: true })));
  }
  await writeFile('.scratch/netcode/failure.json', JSON.stringify({ error: String(error), errors, peers: evidence }));
  throw error;
} finally {
  for (const browser of browsers) await browser.close();
  await vite.close();
}
