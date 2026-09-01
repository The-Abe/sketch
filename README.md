# Playlist Index

Paste a public Spotify playlist URL to compare its artists with the published spreadsheet index.

## Setup

1. Create a Spotify app at <https://developer.spotify.com/dashboard>.
2. Add the URL where the app runs as a Redirect URI, for example `http://localhost:5173/`.
3. Copy `.env.example` to `.env` and set `VITE_SPOTIFY_CLIENT_ID` to the app's client ID.
4. Run `npm install`, then `npm run dev`.

The app uses Spotify's browser-safe PKCE authorization flow. It does not store playlist URLs or sheet data.
