import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, ArrowRight, ChevronDown, ExternalLink, LoaderCircle, Minus, Search } from 'lucide-react'
import './styles.css'
import organizations from '../music_industry_equity_organizations.json'

const SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pubhtml'
const SITE_URL = 'https://blackmetalsketchbook.com/'

const RATINGS = {
  black: { label: 'Fascist / NSBM', order: 0 },
  red: { label: 'Right-wing associations', order: 1 },
  orange: { label: 'Controversy - use discretion', order: 2 },
  yellow: { label: 'Left-wing associations', order: 3 },
  green: { label: 'Anti-fascist', order: 4 },
}

const CYRILLIC = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
const normalize = (value) => [...value.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

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

function linkify(text) {
  return text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part
    const url = part.replace(/[.,;:!?]+$/, '')
    const trailing = part.slice(url.length)
    return <span key={i}><a href={url} target="_blank" rel="noreferrer noopener">{url}</a>{trailing}</span>
  })
}

async function loadIndex() {
  const response = await fetch('/api/index')
  if (!response.ok) throw new Error('The artist index could not be loaded.')
  const list = await response.json()
  return new Map(list.map((entry) => [normalize(entry.band), entry]))
}

async function loadResults(url) {
  const id = playlistIdFromUrl(url)
  if (!id) throw new Error('Paste a valid Spotify playlist URL.')
  const [records, playlistResponse] = await Promise.all([loadIndex(), fetch(`/api/playlist?id=${encodeURIComponent(id)}`)])
  if (!playlistResponse.ok) { let message = 'That playlist could not be loaded.'; try { message = (await playlistResponse.json()).error || message } catch { /* ignore */ } throw new Error(message) }
  const playlist = await playlistResponse.json()
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

const ratingOrder = (rating) => (rating && RATINGS[rating] ? RATINGS[rating].order : 5)

function App() {
  const [url, setUrl] = useState(''); const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(null)
  const runRef = useRef(0)
  const enrich = async (result, run) => {
    const targets = result.artists.filter((artist) => !artist.match)
    if (!targets.length) return
    let cursor = 0
    const patch = (name, changes) => { if (runRef.current !== run) return; setData((prev) => prev ? { ...prev, artists: prev.artists.map((artist) => artist.name === name ? { ...artist, ...changes } : artist) } : prev) }
    const worker = async () => {
      while (true) {
        const artist = targets[cursor++]
        if (!artist || runRef.current !== run) return
        patch(artist.name, { checking: true })
        let info = { blackMetal: null }
        try {
          const response = await fetch(`/api/band?name=${encodeURIComponent(artist.name)}`)
          if (response.ok) info = await response.json()
        } catch { /* ignore */ }
        if (runRef.current !== run) return
        patch(artist.name, { checking: false, genre: info })
        if (info.blackMetal === true) {
          patch(artist.name, { searching: true })
          let threads = { threads: [], redditFailed: false }
          try {
            const response = await fetch(`/api/band/threads?name=${encodeURIComponent(artist.name)}`)
            if (response.ok) threads = await response.json()
          } catch { /* ignore */ }
          if (runRef.current !== run) return
          patch(artist.name, { searching: false, genre: { ...info, threads: threads.threads, redditFailed: threads.redditFailed } })
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
  }
  const submit = async (event) => { event.preventDefault(); setError(''); setData(null); setLoading(true); const run = ++runRef.current; try { const result = await loadResults(url); if (runRef.current !== run) return; setData(result); setLoading(false); enrich(result, run) } catch (err) { if (runRef.current !== run) return; setError(err.message); setLoading(false) } }
  const matched = (data?.artists.filter((artist) => artist.match) || []).sort((a, b) => ratingOrder(a.match.rating) - ratingOrder(b.match.rating) || a.name.localeCompare(b.name))
  const unmatched = data?.artists.filter((artist) => !artist.match) || []
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href={SITE_URL} target="_blank" rel="noreferrer"><span className="brand-text">BLACK METAL <b>SKETCHBOOK</b></span><span className="brand-sub">playlist check</span></a><a className="index-link" href={SHEET_VIEW_URL} target="_blank" rel="noreferrer">View the index <ExternalLink size={13} /></a></header>
    <main>
      <section className="hero">
        <div className="eyebrow"><AlertTriangle size={13} /> ARTIST INDEX · PLAYLIST CHECK</div>
        <h1>Does your playlist<br />harbour <em>fascists?</em></h1>
        <p className="lede">Paste a public Spotify playlist. Every artist is checked against the <a href={SITE_URL} target="_blank" rel="noreferrer">Black Metal Sketchbook</a> index - a living record of NSBM, fascist and anti-fascist associations in black metal. If the band is not in the list, we'll check if it's a black metal band and pull Reddit threads for you to explore.</p>
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
            {matched.map((artist) => <article className="artist-card flagged" key={artist.name}><div className="card-top"><div><div className="artist-name">{artist.name}</div><div className="tag-row">{artist.match.rating && <span className={`tag rating rating-${artist.match.rating}`}><span className="swatch" />{RATINGS[artist.match.rating].label}</span>}{artist.match.nat && <span className="tag">{artist.match.nat}</span>}</div></div><button className="expand" onClick={() => setExpanded(expanded === artist.name ? null : artist.name)} aria-label={`Show notes for ${artist.name}`}><ChevronDown size={18} className={expanded === artist.name ? 'rotate' : ''} /></button></div>{expanded === artist.name && artist.match.notes && <div className="notes">{linkify(artist.match.notes)}</div>}</article>)}
            {matched.length === 0 && <p className="column-empty">No matches found.</p>}
          </div>
          <div className="result-column">
            <div className="column-label"><span className="status-mark clear"><Minus size={13} /></span> NOT LISTED <b>{unmatched.length}</b></div>
            {unmatched.map((artist) => <article className="artist-card clear" key={artist.name}><div className="artist-name">{artist.name}</div>{artist.checking && <div className="band-status">Checking genre…</div>}{!artist.checking && artist.genre && <div className="band-info">{artist.genre.blackMetal === true && <span className="tag genre-black">Black metal</span>}{artist.genre.blackMetal === false && <span className="tag muted">Not black metal</span>}{artist.genre.blackMetal === null && <span className="tag muted">Genre unknown</span>}{artist.searching && <div className="band-status">Searching Reddit…</div>}{!artist.searching && artist.genre.threads?.length > 0 && <ul className="threads">{artist.genre.threads.map((thread, i) => <li key={i}><a href={thread.url} target="_blank" rel="noreferrer noopener">{thread.title || thread.url}</a><span className="thread-sub">r/{thread.subreddit}</span></li>)}</ul>}{!artist.searching && artist.genre.blackMetal === true && artist.genre.threads?.length === 0 && (artist.genre.redditFailed ? <div className="threads-empty">Reddit search is rate-limited - try again in a minute.</div> : <div className="threads-empty">No threads found on /r/isitsketch or /r/rabm.</div>)}</div>}</article>)}
            {unmatched.length === 0 && <p className="column-empty">Every artist is on the index.</p>}
          </div>
        </div>
        <p className="disclaimer">The index is a research sketchbook, not a definitive verdict - read the full notes on <a href={SITE_URL} target="_blank" rel="noreferrer">blackmetalsketchbook.com</a>. An artist not listed simply means they have not been documented yet.</p>
      </section>}
      {!data && !loading && !error && <section className="empty-state"><p>Paste a playlist above to check it against the index and Reddit.</p></section>}
      <section className="orgs">
        <div className="eyebrow">RESOURCES · EQUITY IN MUSIC</div>
        <h2 className="orgs-title">Organizations fighting for equity in music</h2>
        <div className="orgs-grid">
          {organizations.organizations.map((org) => (
            <article className="org-card" key={org.id}>
              <a className="org-name" href={org.website} target="_blank" rel="noreferrer noopener">{org.name} <ExternalLink size={13} /></a>
              <div className="org-region">{org.region}</div>
              <p className="org-desc">{org.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
    <footer><span>Index maintained by <a href={SITE_URL} target="_blank" rel="noreferrer">blackmetalsketchbook.com</a></span><span>submissions · bmsketchbook@gmail.com</span></footer>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
