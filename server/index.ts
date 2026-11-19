import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import type { ClientEvents, ServerEvents } from '../shared/types.js';
import { Game } from './game.js';

const app = express();
const http = createServer(app);
const io = new Server<ClientEvents, ServerEvents>(http, { maxHttpBufferSize: 4096 });
const publish = () => { for (const socket of io.sockets.sockets.values()) socket.emit('state', game.view(socket.id)); };
const game = new Game(publish);

io.on('connection', socket => {
  socket.emit('state', game.view(socket.id));
  const action = (fn: () => void) => {
    try { fn(); publish(); }
    catch (error) { socket.emit('notice', error instanceof Error ? error.message : 'خطایی رخ داد.'); }
  };
  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') return;
    try { game.join(socket.id, data?.name, data?.token); ack({}); publish(); }
    catch (error) { ack({ error: error instanceof Error ? error.message : 'ورود ممکن نیست.' }); }
  });
  socket.on('start', () => action(() => game.start(socket.id)));
  socket.on('swap', data => action(() => game.swap(socket.id, data?.from, data?.to)));
  socket.on('trump', suit => action(() => game.chooseTrump(socket.id, suit)));
  socket.on('play', card => action(() => game.play(socket.id, card)));
  socket.on('next', () => action(() => game.next(socket.id)));
  socket.on('reset', () => action(() => game.reset(socket.id)));
  socket.on('remove', seat => action(() => game.remove(socket.id, seat)));
  socket.on('leave', () => action(() => game.leave(socket.id)));
  socket.on('disconnect', () => { game.disconnect(socket.id); publish(); });
});

if (process.argv.includes('--production')) {
  app.use(express.static(resolve('dist')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4444);
http.listen(port, '0.0.0.0', () => {
  console.log(`Hokm: http://localhost:${port}`);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) console.log(`LAN: http://${entry.address}:${port}`);
    }
  }
});
http.on('error', error => { console.error('Unable to start Hokm:', error.message); process.exit(1); });
