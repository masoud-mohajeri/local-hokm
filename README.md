# LAN Hokm

One room, four players, Persian mobile UI. Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the printed `LAN: http://…:4444` address on four devices on the same network. Keep the host computer running. Allow inbound Node.js connections if the OS firewall asks. Guest Wi-Fi/client isolation can prevent devices reaching the host.

For a built frontend:

```sh
npm run build
npm start
```

Set `PORT` to change the default port (4444). `npm run check` checks TypeScript.

## Playing

Enter names. The first connected player manages the room. Select two seats to swap them; opposite seats are teammates. All four players must be connected to start. Manager may reset a match to rearrange seats.

Hâkem is initially random. Each player receives five cards, Hâkem selects trump, then each receives two more batches of four. Play counterclockwise; follow suit when possible. Ace is highest. The trick winner leads next. A hand ends at seven tricks. Normal win: 1 point; 7–0: 2 points; 7–0 against Hâkem: 3 points. First to at least 7 points wins. Hâkem keeps the role after a team win, otherwise the next player becomes Hâkem.

Disconnects reserve the seat and pause play. Reopen the same address in the same browser to reconnect; no second tab for the same player. Manager passes to the earliest connected player when needed. Reset to the lobby to remove a disconnected player. Voluntary lobby exit frees the seat.

State is held in server memory: restart clears the room. Reconnect identity is stored in browser local storage; clearing it loses the seat identity. This app is for a trusted local network, with no accounts, TLS, spectators, or durable history. No external images, fonts, or services.
