# Euchre Table

Euchre Table is a polished, server-authoritative multiplayer euchre game for exactly four seats. **Play Now** forms a fresh public match from exactly four connected humans; **Private Match** keeps the room-code lobby where open seats are filled by table bots.

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

The Node/WebSocket server owns matchmaking, room membership, dealing, bidding, legal actions, trick resolution, scoring, and bot decisions. Queue mutation and four-player selection are synchronous inside the single server authority, so a player cannot occupy two queue entries and a match is formed atomically. Disconnected queue entries receive a short reconnect grace before cleanup. A player in a formed room resumes the same fixed seat by session token; delayed autopilot keeps an interrupted game moving without giving away that seat.

Creating a room provisions one human and three bots. Before the first deal, joining humans replace bots in seat order. Every client receives a private `RoomView` containing only its own hand and server-calculated legal card IDs.

When hosted at herm.cool, the client requests a short-lived game identity derived from the existing HttpOnly Discord session. `feedback.herm.cool` signs a game-scoped token and the multiplayer backend verifies it before trusting the display name. Direct and signed-out launches use a locally persisted fallback profile; all names are normalized and limited again at the server boundary.

Played cards travel from their relative seat to a face-up center slot using table-plane yaw, then the winning trick highlights, stacks, and sweeps toward the winner. The visual sequence never delays authoritative turns, safely finalizes snapshot jumps, and uses short fades when reduced motion is requested.

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

The QA scripts expect the built server at `http://localhost:8080`. Unit tests cover deck construction, partnerships, both bowers, effective-suit following, trick winners, bot calling support, dealer discard, and every scoring case. Protocol tests cover atomic four-human matching, cancellation, duplicate joins, queue reconnect and stale cleanup, trusted/fallback identity, private bot-seat replacement, resume-in-seat, and out-of-turn rejection. Scene tests cover all four flat card yaws and collection timing. Browser QA covers responsive entry, public and private flows, reload-resume, bidding, card motion/collection, five completed tricks, and score presentation.

## Deployment and herm.cool

`Dockerfile` builds the Vite client and WebSocket server together. `fly.toml` deploys the app to Fly.io in Chicago:

```sh
flyctl deploy
```

The build uses relative static asset paths. When embedded under `herm.cool/games/card/`, the client connects to `wss://online-card-game.fly.dev`; invitations keep the room code in the embedded page URL.

The backend requires `HERM_IDENTITY_SIGNING_KEY` to verify herm.cool game identity tokens. It must match the feedback service's `GAME_IDENTITY_SIGNING_KEY`. Without it, play remains available through the sanitized local profile path, but Discord claims are never trusted.

## Controls

- Pointer/touch: select any raised legal card; use the visible bid controls.
- `1`–`5`: play the corresponding legal card in your hand.
- `P`: pass when passing is available.
- `Esc`: close the rules panel.

## License

MIT
