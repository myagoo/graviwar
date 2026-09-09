import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startSignaling } from '../scripts/signaling.mjs';

const server = startSignaling(0);
await once(server, 'listening');
try {
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    const [raw] = await once(socket, 'message');
    return { socket, id: JSON.parse(raw).clientID };
  };
  const a = await connect(), b = await connect();
  a.socket.send(JSON.stringify({kind:'send-message', destinationID:b.id, type:'offer', payload:{sdp:'test'}}));
  const [raw] = await once(b.socket, 'message');
  assert.equal(JSON.parse(raw).sourceID, a.id);
  a.socket.send(JSON.stringify({kind:'match-request'}));
  const [failure] = await once(a.socket, 'message');
  assert.equal(JSON.parse(failure).kind, 'match-request-failure');
  a.socket.send('null');
  const [code] = await once(a.socket, 'close');
  assert.equal(code, 1008);
  console.log('PASS local signaling: forwarding, unsupported matchmaking, invalid data');
} finally {
  for (const socket of server.clients) socket.terminate();
  await new Promise(resolve => server.close(resolve));
}
