# Black Metal Sketchbook — Playlist Check

Paste a public Spotify playlist URL to check its artists against the [Black Metal Sketchbook](https://blackmetalsketchbook.com/) index — a living record of NSBM, fascist and anti-fascist associations in black metal.

No Spotify API app, OAuth, or client credentials are required. The server fetches Spotify's public embed page and reads the track/artist list from it.

## Run locally

```sh
npm install
npm run dev      # Vite dev server (the /api/playlist proxy runs in server.js)
```

To run the production server (serves the built app + the `/api/playlist` proxy):

```sh
npm run build
npm start        # listens on :4098 (PORT env to override)
```

## Deploy (Docker + Tailscale)

```sh
TS_AUTHKEY=tskey-... docker compose up --build
```

## Source

Artist index: <https://blackmetalsketchbook.com/> · submissions: bmsketchbook@gmail.com
