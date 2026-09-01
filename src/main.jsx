import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, ArrowUpRight, Check, ChevronDown, Disc3, ExternalLink, LoaderCircle, Search, Settings2, Sparkles } from 'lucide-react'
import './styles.css'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pub?output=csv'
const SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pubhtml'

const normalize = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1]
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function playlistIdFromUrl(value) {
  try {
    const url = new URL(value)
    if (!url.hostname.endsWith('spotify.com')) return null
    const match = url.pathname.match(/playlist\/([a-zA-Z0-9]+)/)
    return match?.[1] || null
  } catch { return null }
}

async function getSpotifyToken() {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (!clientId) throw new Error('Spotify is not configured yet. Add VITE_SPOTIFY_CLIENT_ID to your environment.')
  const cached = sessionStorage.getItem('spotify-token')
  if (cached) { const parsed = JSON.parse(cached); if (parsed.expires > Date.now()) return parsed.token }
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const challengeBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(challengeBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const redirect = window.location.origin + window.location.pathname
  const authUrl = new URL('https://accounts.spotify.com/authorize')
  authUrl.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: challenge, scope: '' })
  const params = new URLSearchParams(window.location.search)
  if (!params.get('code')) { sessionStorage.setItem('spotify-verifier', verifier); window.location.href = authUrl.toString(); return null }
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code: params.get('code'), redirect_uri: redirect, code_verifier: sessionStorage.getItem('spotify-verifier') }) })
  if (!response.ok) throw new Error('Spotify authorization failed. Check your app redirect URI.')
  const data = await response.json(); sessionStorage.setItem('spotify-token', JSON.stringify({ token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 })); window.history.replaceState({}, '', window.location.pathname)
  return data.access_token
}

async function loadResults(url) {
  const id = playlistIdFromUrl(url)
  if (!id) throw new Error('Paste a valid Spotify playlist URL to continue.')
  sessionStorage.setItem('spotify-playlist-url', url)
  const token = await getSpotifyToken(); if (!token) return null
  const [sheetResponse, playlistResponse] = await Promise.all([fetch(SHEET_URL), fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`, { headers: { Authorization: `Bearer ${token}` } })])
  if (!sheetResponse.ok) throw new Error('The public spreadsheet could not be loaded.')
  if (!playlistResponse.ok) { const body = await playlistResponse.json().catch(() => null); throw new Error(`Spotify could not load that playlist (${playlistResponse.status}${body?.error?.message ? `: ${body.error.message}` : ''}).`) }
  const [sheetText, playlist] = await Promise.all([sheetResponse.text(), playlistResponse.json()])
  let next = playlist.next; const tracks = [...playlist.items]
  while (next) { const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } }); const page = await response.json(); tracks.push(...page.items); next = page.next }
  const rows = parseCsv(sheetText); const headerIndex = rows.findIndex((row) => row.some((value) => value.trim().toUpperCase() === 'BAND'))
  const headers = rows[headerIndex].map((value) => value.trim().toUpperCase()); const index = (name) => headers.indexOf(name)
  const records = new Map(rows.slice(headerIndex + 1).filter((row) => row[index('BAND')]?.trim()).map((row) => [normalize(row[index('BAND')]), { band: row[index('BAND')].trim(), nat: row[index('NAT')]?.trim(), rating: row[index('RATING')]?.trim(), notes: row[index('NOTES')]?.trim() }]))
  const artists = new Map()
  tracks.forEach(({ track }) => track?.artists?.forEach((artist) => artists.set(artist.id, { name: artist.name, spotifyUrl: artist.external_urls.spotify, match: records.get(normalize(artist.name)) })))
  return { playlistName: playlist.name, playlistImage: playlist.images?.[0]?.url, artists: [...artists.values()] }
}

function App() {
  const [url, setUrl] = useState(''); const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(null)
  const run = async (targetUrl) => { setError(''); setData(null); setLoading(true); try { setData(await loadResults(targetUrl)) } catch (err) { setError(err.message) } finally { setLoading(false) } }
  const submit = async (event) => { event.preventDefault(); run(url) }
  useEffect(() => { const code = new URLSearchParams(window.location.search).get('code'); if (code) { const savedUrl = sessionStorage.getItem('spotify-playlist-url'); if (savedUrl) { setUrl(savedUrl); run(savedUrl) } } }, [])
  const matched = data?.artists.filter((artist) => artist.match) || []; const unmatched = data?.artists.filter((artist) => !artist.match) || []
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><Disc3 size={20} /></span><span>PLAYLIST <b>INDEX</b></span></a><a className="sheet-link" href={SHEET_VIEW_URL} target="_blank" rel="noreferrer">View source sheet <ExternalLink size={14} /></a></header>
    <main>
      <section className="hero"><div className="eyebrow"><Sparkles size={14} /> SIGNAL / SCAN 001</div><h1>What’s in your<br /><em>orbit?</em></h1><p className="lede">Drop in a Spotify playlist. We’ll cross-reference every artist against the index and surface the context behind the music.</p>
        <form className="search-form" onSubmit={submit}><div className="input-wrap"><Search size={20} /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/..." aria-label="Spotify playlist URL" /></div><button disabled={loading || !url.trim()}>{loading ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />} {loading ? 'Scanning' : 'Scan playlist'}</button></form>
        <div className="microcopy"><span><span className="dot green" /> public playlist only</span><span><span className="dot" /> no data is stored</span></div>
      </section>
      {error && <div className="notice error"><AlertCircle size={18} /><span>{error}</span></div>}
      {data && <section className="results"><div className="result-heading"><div><div className="eyebrow">SCAN COMPLETE</div><h2>{data.playlistName}</h2></div><div className="stats"><strong>{data.artists.length}</strong><span>artists found</span></div></div><div className="result-grid"><div className="result-column"><div className="column-label"><span className="status-mark matched"><Check size={13} /></span> INDEXED <b>{matched.length}</b></div>{matched.map((artist) => <article className="artist-card" key={artist.name}><div className="card-top"><div><a href={artist.spotifyUrl} target="_blank" rel="noreferrer" className="artist-name">{artist.name} <ExternalLink size={13} /></a><div className="tag-row">{artist.match.nat && <span className="tag">{artist.match.nat}</span>}{artist.match.rating && <span className="tag rating">{artist.match.rating}</span>}</div></div><button className="expand" onClick={() => setExpanded(expanded === artist.name ? null : artist.name)} aria-label={`Show notes for ${artist.name}`}><ChevronDown size={18} className={expanded === artist.name ? 'rotate' : ''} /></button></div>{expanded === artist.name && artist.match.notes && <div className="notes">{artist.match.notes}</div>}</article>)}</div><div className="result-column"><div className="column-label"><span className="status-mark missing">?</span> NOT YET INDEXED <b>{unmatched.length}</b></div>{unmatched.map((artist) => <article className="artist-card missing-card" key={artist.name}><a href={artist.spotifyUrl} target="_blank" rel="noreferrer" className="artist-name">{artist.name} <ExternalLink size={13} /></a><span className="unlisted">No matching row</span></article>)}</div></div></section>}
      {!data && !loading && !error && <section className="empty-state"><div className="empty-orbit"><span /><span /><span /></div><p>Your scan will appear here</p></section>}
    </main><footer><span>PLAYLIST INDEX / 2026</span><span>Built for digging deeper</span></footer>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
