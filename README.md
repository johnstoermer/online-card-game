# Online Card Game

Online Card Game is an original multiplayer poker roguelite for one to four players. It combines a tactile voxel-style 3D table with server-authoritative rooms, reconnectable sessions, house-player support, procedural sound, and responsive keyboard, pointer, and touch controls.

## Game loop

- Each player receives eight cards, three scoring hands, and two discards per round.
- Poker hands score `chips × multiplier`. Changing the previous hand type builds a shared echo chain worth up to `×1.75`.
- Cooperative contracts combine every player's score against an escalating target.
- Table Versus gives every seat the same hand budget. The highest personal score wins the round, and the first player to three round wins takes the match.
- After each successful contract or versus round, every player sets one persistent piece on their table.
- Every piece is a poker-table object with a scoring rule and a physical 3D result: stacks gain chips, betting plaques rise, card guards light, the call bell winds toward its third ring, and Red Felt relines the entire playing surface.
- A table holds five pieces. Adding another requires clearing one occupied space, and the removed object's stored state leaves with it.
- Every third round is a boss contract with a hostile house rule.
- If a player disconnects, the server preserves their seat and temporarily pilots their remaining hands so the table cannot deadlock.

## Hand management

- Rank sort orders cards from high to low and keeps equal ranks grouped by suit.
- Suit sort groups spades, hearts, clubs, and diamonds, with ranks ordered inside each suit.
- Drag any card across the hand to create a persistent custom order.
- Selected cards stay selected when sorting, dragging, dealing replacements, or switching sort modes.
- Number keys always map to the cards' current visual order.

## Local development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev:server
npm run dev
```

The client runs at `http://localhost:5173` and connects to the local room server on port `8080`.

For the production-style build:

```sh
npm run build
npm start
```

## Verification

```sh
npm test
npm run qa
npm run qa:versus
```

The QA scripts expect a built server running at `http://localhost:8080`. The browser pass opens isolated sessions, validates responsive layout and hand-sort controls, plays a cooperative contract through table-piece placement, and completes a two-player versus round. The versus protocol pass plays an entire first-to-three match and verifies persistent table state, win tallies, and the final match event. Set `QA_URL`, `QA_WS_URL`, or `CHROME_PATH` to override their defaults.

## Deployment

The included `Dockerfile` builds the static client and TypeScript room server. `fly.toml` deploys them as one Fly.io app in the Chicago region:

```sh
flyctl deploy
```

The Vite build uses relative asset paths, so `dist/` can also be embedded under another site path or inside an iframe. When hosted on `herm.cool`, the client connects to `wss://online-card-game.fly.dev`.

## Controls

- `1`–`8`: select or unselect a card
- `Enter`: play the selected hand
- `D`: discard the selected cards
- `R`: sort the hand by rank
- `S`: sort the hand by suit
- Drag a card: switch to a custom hand order

## License

MIT
