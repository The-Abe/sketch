import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowRight, ChevronDown, ExternalLink, LoaderCircle, Minus, Search } from 'lucide-react'
import './styles.css'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pub?output=csv'
const SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pubhtml'
const SITE_URL = 'https://blackmetalsketchbook.com/'

const CYRILLIC = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
const normalize = (value) => [...value.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

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

function splitArtists(subtitle) {
  if (!subtitle) return []
  return subtitle.split(/,\s*|\s*&\s*/).map((s) => s.trim()).filter(Boolean)
}

async function loadResults(url) {
  const id = playlistIdFromUrl(url)
  if (!id) throw new Error('Paste a valid Spotify playlist URL.')
  const [sheetResponse, playlistResponse] = await Promise.all([fetch(SHEET_URL), fetch(`/api/playlist?id=${encodeURIComponent(id)}`)])
  if (!sheetResponse.ok) throw new Error('The artist index could not be loaded.')
  if (!playlistResponse.ok) { let message = 'That playlist could not be loaded.'; try { message = (await playlistResponse.json()).error || message } catch { /* ignore */ } throw new Error(message) }
  const [sheetText, playlist] = await Promise.all([sheetResponse.text(), playlistResponse.json()])
  const rows = parseCsv(sheetText)
  const headerIndex = rows.findIndex((row) => row.some((value) => value.trim().toUpperCase() === 'BAND'))
  const headers = rows[headerIndex].map((value) => value.trim().toUpperCase()); const index = (name) => headers.indexOf(name)
  const records = new Map(rows.slice(headerIndex + 1).filter((row) => row[index('BAND')]?.trim()).map((row) => [normalize(row[index('BAND')]), { band: row[index('BAND')].trim(), nat: row[index('NAT')]?.trim(), notes: row[index('NOTES')]?.trim() }]))
  const artists = new Map()
  for (const track of playlist.tracks || []) {
    for (const name of splitArtists(track.subtitle)) {
      const key = normalize(name) || name.toLowerCase()
      if (artists.has(key)) continue
      artists.set(key, { name, match: records.get(key) })
    }
  }
  return { playlistName: playlist.name, playlistImage: playlist.image, artists: [...artists.values()] }
}

function App() {
  const [url, setUrl] = useState(''); const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(null)
  const submit = async (event) => { event.preventDefault(); setError(''); setData(null); setLoading(true); try { setData(await loadResults(url)) } catch (err) { setError(err.message) } finally { setLoading(false) } }
  const matched = data?.artists.filter((artist) => artist.match) || []; const unmatched = data?.artists.filter((artist) => !artist.match) || []
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href={SITE_URL} target="_blank" rel="noreferrer"><span className="brand-text">BLACK METAL <b>SKETCHBOOK</b></span><span className="brand-sub">playlist check</span></a><a className="index-link" href={SHEET_VIEW_URL} target="_blank" rel="noreferrer">View the index <ExternalLink size={13} /></a></header>
    <main>
      <section className="hero">
        <div className="eyebrow"><AlertTriangle size={13} /> ARTIST INDEX · PLAYLIST CHECK</div>
        <h1>Does your playlist<br />harbour <em>fascists?</em></h1>
        <p className="lede">Paste a public Spotify playlist. Every artist is checked against the <a href={SITE_URL} target="_blank" rel="noreferrer">Black Metal Sketchbook</a> index — a living record of NSBM, fascist and anti-fascist associations in black metal.</p>
        <form className="search-form" onSubmit={submit}>
          <div className="input-wrap"><Search size={20} /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/..." aria-label="Spotify playlist URL" /></div>
          <button disabled={loading || !url.trim()}>{loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} {loading ? 'Checking' : 'Check playlist'}</button>
        </form>
        <div className="microcopy"><span>public playlists only</span><span>nothing is stored</span></div>
      </section>
      {error && <div className="notice error"><AlertTriangle size={18} /><span>{error}</span></div>}
      {data && <section className="results">
        <div className="result-heading">
          <div className="result-title">{data.playlistImage && <img className="cover" src={data.playlistImage} alt="" />}<div><div className="eyebrow">CHECK COMPLETE</div><h2>{data.playlistName}</h2></div></div>
          <div className="stats"><strong>{data.artists.length}</strong><span>artists checked</span></div>
        </div>
        <div className="result-grid">
          <div className="result-column">
            <div className="column-label"><span className="status-mark flagged"><AlertTriangle size={13} /></span> ON THE INDEX <b>{matched.length}</b></div>
            {matched.map((artist) => <article className="artist-card flagged" key={artist.name}><div className="card-top"><div><div className="artist-name">{artist.name}</div><div className="tag-row">{artist.match.nat && <span className="tag">{artist.match.nat}</span>}</div></div><button className="expand" onClick={() => setExpanded(expanded === artist.name ? null : artist.name)} aria-label={`Show notes for ${artist.name}`}><ChevronDown size={18} className={expanded === artist.name ? 'rotate' : ''} /></button></div>{expanded === artist.name && artist.match.notes && <div className="notes">{artist.match.notes}</div>}</article>)}
            {matched.length === 0 && <p className="column-empty">No matches found.</p>}
          </div>
          <div className="result-column">
            <div className="column-label"><span className="status-mark clear"><Minus size={13} /></span> NOT LISTED <b>{unmatched.length}</b></div>
            {unmatched.map((artist) => <article className="artist-card clear" key={artist.name}><div className="artist-name">{artist.name}</div></article>)}
            {unmatched.length === 0 && <p className="column-empty">Every artist is on the index.</p>}
          </div>
        </div>
        <p className="disclaimer">The index is a research sketchbook, not a definitive verdict — read the full notes on <a href={SITE_URL} target="_blank" rel="noreferrer">blackmetalsketchbook.com</a>. An artist not listed simply means they have not been documented yet.</p>
      </section>}
      {!data && !loading && !error && <section className="empty-state"><p>Paste a playlist above to check it against the index.</p></section>}
    </main>
    <footer><span>Index maintained by <a href={SITE_URL} target="_blank" rel="noreferrer">blackmetalsketchbook.com</a></span><span>submissions · bmsketchbook@gmail.com</span></footer>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
