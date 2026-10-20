import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import type { FastifyInstance } from 'fastify';
import type { RealtimeFrame, SyncState } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import type { Environment } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { listVehicles } from '../reservations/queries.js';
import { consumeTicket } from './routes.js';
import { syncState } from './snapshot.js';

const PROTOCOL = 'samokettik.v1', DEBOUNCE_MS = 25, LISTEN_RETRY_MS = 1000;
type ClientState = { id: string; userId: string | null; sequence: number; alive: boolean };
export function registerRealtime(app: FastifyInstance, env: Environment, config: BusinessConfig, database: Database) {
  const server = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1024, handleProtocols: protocols => protocols.has(PROTOCOL) ? PROTOCOL : false });
  const clients = new Map<WebSocket, ClientState>();
  let stopped = false, dirty = false, pendingUpgrades = 0;
  let scheduled: NodeJS.Timeout | undefined, reconcile: NodeJS.Timeout | undefined, heartbeat: NodeJS.Timeout | undefined, retry: NodeJS.Timeout | undefined;
  let task: Promise<void> | null = null, listener: pg.Client | null = null;

  async function flush() {
    dirty = false;
    if (stopped || clients.size === 0) return;
    try {
      const fleet = await listVehicles(database, config), privateStates = new Map<string, SyncState>();
      for (const [socket, client] of clients) {
        if (stopped || socket.readyState !== WebSocket.OPEN) continue;
        if (socket.bufferedAmount > env.wsMaxBufferedBytes) { socket.close(1013, 'Client is too slow'); continue; }
        let frame: RealtimeFrame;
        if (client.userId) {
          let state = privateStates.get(client.userId);
          if (!state) { state = await syncState(database, config, client.userId); privateStates.set(client.userId, state); }
          frame = { type: 'state_snapshot', connectionId: client.id, sequence: ++client.sequence, state };
        } else frame = { type: 'fleet_snapshot', connectionId: client.id, sequence: ++client.sequence, fleet };
        if (!stopped && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame), error => { if (error) socket.terminate(); });
      }
    } catch {
      for (const socket of clients.keys()) socket.close(1013, 'State temporarily unavailable');
    }
  }
  function schedule() {
    if (stopped) return;
    dirty = true;
    if (scheduled || task) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      task = flush().finally(() => { task = null; if (dirty && !stopped) schedule(); });
    }, DEBOUNCE_MS);
  }
  function retire(client: pg.Client) {
    if (listener !== client) return;
    listener = null;
    void client.end().catch(() => {});
    if (!stopped && !retry) retry = setTimeout(() => { retry = undefined; void connectListener(); }, LISTEN_RETRY_MS);
  }
  async function connectListener() {
    if (stopped) return;
    const client = new pg.Client({ connectionString: database.connectionString, connectionTimeoutMillis: 2000, application_name: 'samokettik-realtime', keepAlive: true });
    listener = client;
    client.on('notification', schedule);
    client.on('error', () => retire(client));
    client.on('end', () => retire(client));
    try { await client.connect(); await client.query('LISTEN samokettik_changes'); if (!stopped) schedule(); }
    catch { retire(client); }
  }
  function reject(socket: Duplex, status: '401 Unauthorized' | '403 Forbidden' | '404 Not Found' | '503 Service Unavailable') {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  async function authenticate(request: IncomingMessage, socket: Duplex, head: Buffer) {
    if (request.url !== '/api/v1/realtime') return reject(socket, '404 Not Found');
    const origin = request.headers.origin;
    if (!origin || !env.wsAllowedOrigins.includes(origin)) return reject(socket, '403 Forbidden');
    const protocols = (request.headers['sec-websocket-protocol'] ?? '').split(',').map(value => value.trim());
    if (!protocols.includes(PROTOCOL)) return reject(socket, '401 Unauthorized');
    if (stopped || clients.size + pendingUpgrades >= env.wsMaxClients) return reject(socket, '503 Service Unavailable');
    pendingUpgrades++;
    try {
      const tickets = protocols.filter(value => value.startsWith('ticket.'));
      let userId: string | null = null;
      if (tickets.length) {
        const ticket = tickets[0]?.slice(7);
        if (tickets.length !== 1 || !ticket || !/^[a-f0-9]{64}$/.test(ticket) || !(userId = await consumeTicket(database, ticket))) return reject(socket, '401 Unauthorized');
      }
      if (stopped || socket.destroyed) return socket.destroy();
      server.handleUpgrade(request, socket, head, connection => {
        clients.set(connection, { id: randomUUID(), userId, sequence: 0, alive: true });
        connection.on('close', () => clients.delete(connection));
        connection.on('error', () => connection.terminate());
        connection.on('pong', () => { const state = clients.get(connection); if (state) state.alive = true; });
        // Commands remain validated HTTP operations; sockets are read-only.
        connection.on('message', () => connection.close(1008, 'Use HTTP commands'));
        schedule();
      });
    } catch { if (!socket.destroyed) reject(socket, '503 Service Unavailable'); }
    finally { pendingUpgrades--; }
  }
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => { socket.on('error', () => socket.destroy()); void authenticate(request, socket, head); };
  app.server.on('upgrade', upgrade);
  app.addHook('onReady', async () => {
    void connectListener();
    reconcile = setInterval(schedule, env.wsReconcileMs);
    heartbeat = setInterval(() => {
      for (const [socket, client] of clients) {
        if (!client.alive) { socket.terminate(); continue; }
        client.alive = false;
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }
    }, env.wsHeartbeatMs);
  });
  app.addHook('preClose', async () => {
    stopped = true;
    for (const timer of [scheduled, reconcile, heartbeat, retry]) clearTimeout(timer);
    app.server.removeListener('upgrade', upgrade);
    for (const socket of clients.keys()) socket.terminate();
    if (task) await task;
    const client = listener; listener = null;
    if (client) await client.end().catch(() => {});
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
}
