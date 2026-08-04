# Euchre Table

Euchre Table is a polished, server-authoritative multiplayer euchre game for exactly four seats. Partners sit across the table. Open seats are filled immediately by capable table bots, and human players can take those seats in the pregame lobby with a four-letter room code.

The client preserves the project’s tactile voxel-style Three.js identity: sculpted wood rails, deep green felt, physical cards, a moving dealer puck, a brass trump marker, fixed seat geometry, and responsive HUD instrumentation.

## Rules

- Standard 24-card deck: 9, 10, J, Q, K, A in all four suits.
- Five cards per player, rotating dealer, upcard, first ordering round, then a second calling round that excludes the turned-down suit.
- Stick the dealer is enabled: the dealer must name trump in the second round.
- The right bower is highest. The same-color jack is the left bower, ranks second, and belongs to the trump suit for follow-suit rules.
- Players must follow the effective led suit when able. The trick winner leads next.
- A caller may go alone; their partner sits out for that five-trick hand.
- Makers score 1 for three or four tricks, or 2 for a five-trick march. Defenders score 2 for a euchre. A lone march scores 4; a loner taking three or four scores 1.
- First team to 10 wins.

## Multiplayer architecture

The Node/WebSocket server owns room membership, dealing, bidding, legal actions, trick resolution, scoring, and bot decisions. A reconnecting player resumes the same fixed seat by session token. If a player disconnects during a game, delayed autopilot keeps the table moving without giving away their seat.

Creating a room provisions one human and three bots. Before the first deal, joining humans replace bots in seat order. Every client receives a private `RoomView` containing only its own hand and server-calculated legal card IDs.

## Local development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev:server
npm run dev
```

The Vite client runs at `http://localhost:5173` and connects to the WebSocket server at `ws://localhost:8080`.

For a production-style run:

```sh
npm run build
npm start
```

## Verification

```sh
npm test
npm run build
npm run qa:protocol
npm run qa
```

The QA scripts expect the built server at `http://localhost:8080`. Unit tests cover deck construction, partnerships, both bowers, effective-suit following, trick winners, bot calling support, dealer discard, and every scoring case. Protocol tests cover four fixed seats, bot-seat replacement, start state, resume-in-seat, and rejection of out-of-turn actions. Browser QA covers responsive layout, lobby/join, reload-resume, bidding, card play, five completed tricks, and score presentation.

## Deployment and herm.cool

`Dockerfile` builds the Vite client and WebSocket server together. `fly.toml` deploys the app to Fly.io in Chicago:

```sh
flyctl deploy
```

The build uses relative static asset paths. When embedded under `herm.cool/games/card/`, the client connects to `wss://online-card-game.fly.dev`; invitations keep the room code in the embedded page URL.

## Controls

- Pointer/touch: select any raised legal card; use the visible bid controls.
- `1`–`5`: play the corresponding legal card in your hand.
- `P`: pass when passing is available.
- `Esc`: close the rules panel.

## License

MIT
