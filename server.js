import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const PORT = Number(process.env.PORT) || 4098

const SHEET_URL = 'https://docs.google.com/spreadsheets/u/0/d/e/2PACX-1vQMafFBtiGF_ZWIlL24B18K-tGk9VMsWuzPrW_ozGfwsvBldruVVld7kSVjd2kRaL45yGsvT61-iwL-/pubhtml/sheet?headers=false&gid=0'
const BAND_GENRES_FILE = join(fileURLToPath(new URL('.', import.meta.url)), 'band-genres.json')

const CYRILLIC = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
const normalizeBand = (value) => [...value.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const RATING_BY_COLOR = {
  '#34a853': 'green',
  '#f1e00a': 'yellow',
  '#ff6d01': 'orange',
  '#ff0000': 'red',
  '#000000': 'black',
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

function json(res, status, obj, extra = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ''))
}

const execFileP = promisify(execFile)

async function curlText(url, accept) {
  try {
    const { stdout } = await execFileP('curl', ['-sS', '--fail', '-L', '--max-time', '25', '-A', UA, '-H', `Accept: ${accept}`, url], { maxBuffer: 20 * 1024 * 1024 })
    return stdout
  } catch {
    return null
  }
}

function parseSheet(html) {
  const colors = {}
  for (const m of html.matchAll(/\.waffle \.s(\d+)\{([^}]*)\}/g)) {
    const bg = m[2].match(/background-color:\s*(#[0-9a-fA-F]+)/)
    colors[`s${m[1]}`] = bg ? bg[1] : '#ffffff'
  }
  const rows = []
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    rows.push([...m[1].matchAll(/<td[^>]*class="(s\d+)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => ({ cls: c[1], text: stripTags(c[2]) })))
  }
  const headerIdx = rows.findIndex((r) => r[0] && r[0].text.trim().toUpperCase() === 'BAND')
  if (headerIdx < 0) return []
  const out = []
  for (const row of rows.slice(headerIdx + 1)) {
    if (row.length < 3) continue
    const band = row[0].text.trim()
    if (!band) continue
    const nat = row[1].text.trim()
    const bg = colors[row[2].cls] || '#ffffff'
    const rating = RATING_BY_COLOR[bg] || null
    const notes = row.length > 3 ? row[3].text.trim() : ''
    out.push({ band, nat, rating, notes })
  }
  return out
}

const cache = new Map()
function cached(key, ttlMs, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  const value = load()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function loadIndex() {
  return cached('index', 10 * 60 * 1000, async () => {
    const resp = await fetch(SHEET_URL, { headers: { 'User-Agent': UA } })
    if (!resp.ok) throw new Error('index fetch failed')
    return parseSheet(await resp.text())
  })
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]{10,30}$/.test(id) ? id : null
}

let bandGenres = null
let bandGenresWrite = Promise.resolve()
async function loadBandGenres() {
  if (bandGenres) return bandGenres
  try {
    const obj = JSON.parse(await readFile(BAND_GENRES_FILE, 'utf8'))
    bandGenres = new Map(Object.entries(obj).map(([name, blackMetal]) => [normalizeBand(name), { name, blackMetal }]))
  } catch {
    bandGenres = new Map()
  }
  return bandGenres
}

function persistBandGenres() {
  const obj = Object.fromEntries([...bandGenres.values()].map((e) => [e.name, e.blackMetal]))
  bandGenresWrite = bandGenresWrite.then(() => writeFile(BAND_GENRES_FILE, JSON.stringify(obj, null, 2) + '\n')).catch(() => {})
}

async function fetchMetalArchivesGenre(name) {
  const slug = name.trim().replace(/\s+/g, '_')
  const html = await curlText(`https://www.metal-archives.com/bands/${encodeURIComponent(slug)}`, 'text/html')
  if (!html) return null
  const match = html.match(/<dt>Genre:<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)
  if (!match) return null
  const genre = decodeEntities(stripTags(match[1])).trim()
  return genre || null
}

const isBlackMetal = (genre) => /black/i.test(genre)

async function fetchRedditFeed(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.rss?q=${encodeURIComponent(query)}&restrict_sr=1`
  const xml = await curlText(url, 'application/atom+xml,application/xml,text/xml')
  if (!xml) return null
  const out = []
  for (const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = entry[1]
    const link = body.match(/<link[^>]*href="([^"]+)"/)
    const title = body.match(/<title>([\s\S]*?)<\/title>/)
    const clean = title ? decodeEntities(stripTags(title[1])).replace(/\s*:\s*r\/\w+\s*$/, '').trim() : ''
    if (link) out.push({ subreddit, title: clean, url: link[1] })
  }
  return out
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchRedditThreads(name) {
  const threads = []
  for (const subreddit of ['isitsketch', 'rabm']) {
    let got = null
    for (let attempt = 0; attempt < 3 && got === null; attempt++) {
      got = await fetchRedditFeed(subreddit, name)
      if (got === null) await sleep(800 * (attempt + 1))
    }
    threads.push(...(got || []))
  }
  return threads
}

async function lookupBand(name) {
  const genres = await loadBandGenres()
  const key = normalizeBand(name)
  const cached = genres.get(key)
  if (cached) {
    const threads = cached.blackMetal ? await searchRedditThreads(name) : []
    return { name, blackMetal: cached.blackMetal, threads }
  }
  const genre = await fetchMetalArchivesGenre(name)
  if (genre == null) return { name, blackMetal: null, threads: [] }
  const blackMetal = isBlackMetal(genre)
  genres.set(key, { name, blackMetal })
  persistBandGenres()
  const threads = blackMetal ? await searchRedditThreads(name) : []
  return { name, blackMetal, genre, threads }
}

async function scrapePlaylist(id) {
  const resp = await fetch(`https://open.spotify.com/embed/playlist/${id}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!resp.ok) return { status: 502, error: `Spotify returned ${resp.status}.` }
  const html = await resp.text()
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) return { status: 502, error: 'Could not read the playlist data.' }
  let data
  try { data = JSON.parse(match[1]) } catch { return { status: 502, error: 'Could not parse the playlist data.' } }
  const entity = data?.props?.pageProps?.state?.data?.entity
  if (!entity || entity.type !== 'playlist') return { status: 404, error: 'Playlist not found, or it is private. Only public playlists can be checked.' }
  const tracks = (entity.trackList || []).map((t) => ({ title: t.title || '', subtitle: t.subtitle || '' }))
  const image = entity.coverArt?.sources?.[0]?.url || null
  return { status: 200, name: entity.name, image, tracks }
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/index') {
    try {
      return json(res, 200, await loadIndex())
    } catch {
      return json(res, 502, { error: 'The artist index could not be loaded.' })
    }
  }
  if (url.pathname === '/api/playlist') {
    const id = validId(url.searchParams.get('id'))
    if (!id) return json(res, 400, { error: 'Invalid playlist ID.' })
    try {
      const result = await scrapePlaylist(id)
      if (result.error) return json(res, result.status, { error: result.error })
      return json(res, 200, { name: result.name, image: result.image, tracks: result.tracks })
    } catch {
      return json(res, 502, { error: 'Failed to load the playlist.' })
    }
  }
  if (url.pathname === '/api/band') {
    const name = (url.searchParams.get('name') || '').trim()
    if (!name) return json(res, 400, { error: 'Missing band name.' })
    try {
      return json(res, 200, await lookupBand(name))
    } catch {
      return json(res, 502, { error: 'Could not look up the band.' })
    }
  }
  return json(res, 404, { error: 'Not found.' })
}

async function serveStatic(res, pathname) {
  const p = pathname === '/' ? '/index.html' : normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  try {
    const content = await readFile(join(DIST, p))
    return send(res, 200, content, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' })
  } catch {
    if (extname(p)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' })
    try {
      const content = await readFile(join(DIST, 'index.html'))
      return send(res, 200, content, { 'Content-Type': MIME['.html'] })
    } catch {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' })
    }
  }
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url)
  return serveStatic(res, url.pathname)
}).listen(PORT, () => console.log(`listening on :${PORT}`))
