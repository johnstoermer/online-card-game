# Online Card Game

Online Card Game is a cooperative poker-combo roguelite for one to four players. It is an original game with a tactile voxel-style 3D table, server-authoritative rooms, reconnectable sessions, house-player support, procedural sound, and responsive keyboard/touch controls.

## Game loop

- Each player receives eight cards, three scoring hands, and two discards per contract.
- Poker hands score `chips × multiplier` into a shared target.
- Playing a different hand type than the previous player builds an echo chain worth up to `×1.75`.
- Clearing a contract lets every player add one permanent relic to their own scoring machine.
- Every third round is a boss contract with a hostile house rule.
- If a player disconnects, the server preserves their seat and temporarily pilots their remaining hands so the table cannot deadlock.

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
```

The QA script expects a built server running at `http://localhost:8080`. It opens two isolated browser sessions, creates and joins a room, adds a house player, plays through a contract, chooses relics, and verifies the second round begins. Set `QA_URL` or `CHROME_PATH` to override its defaults.

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

## License

MIT
