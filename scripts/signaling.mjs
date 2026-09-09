import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

// Signaling only: no physics, inputs, or authoritative game state passes through here.
export function startSignaling(port = 3001, iceServers = []) {
  const server = new WebSocketServer({ port, host: '127.0.0.1', maxPayload: 65536 });
  const clients = new Map();
  server.on('connection', socket => {
    const id = randomUUID();
    clients.set(id, socket);
    socket.send(JSON.stringify({ kind: 'registration-success', clientID: id, iceServers }));
    socket.on('message', raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return socket.close(1008, 'Invalid JSON'); }
      if (!data || typeof data !== 'object') return socket.close(1008, 'Invalid message');
      if (data.kind === 'match-request') {
        socket.send(JSON.stringify({ kind: 'match-request-failure', reason: 'Local signaling supports invite links only' }));
        return;
      }
      if (data.kind !== 'send-message' || typeof data.destinationID !== 'string' || !['offer','answer','candidate'].includes(data.type)) return;
      const destination = clients.get(data.destinationID);
      if (destination?.readyState === WebSocket.OPEN) destination.send(JSON.stringify({ kind: 'peer-message', sourceID: id, type: data.type, payload: data.payload }));
      else socket.send(JSON.stringify({ kind: 'send-message-failure', destinationID: data.destinationID, reason: 'Peer unavailable' }));
    });
    socket.on('close', () => clients.delete(id));
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startSignaling(Number(process.env.PORT || 3001));
  server.on('listening', () => console.log(`Signaling: http://127.0.0.1:${server.address().port}`));
}
