// Snapshots the current Apple Music "most played" albums (US) into
// src/demo/demoData.json: cover art (CORS-enabled CDN), the album's biggest
// song and its 30-second preview. Re-run whenever you want a fresh demo set:
//   node scripts/build-demo.mjs
import { writeFileSync } from 'node:fs'

const MARKET = process.argv[2] ?? 'us'
const COUNT = 50
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { redirect: 'follow' })
    if (res.ok) return res.json()
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const wait = 15_000 * (i + 1)
      console.warn(`  ${res.status} on ${url.slice(0, 60)}… waiting ${wait / 1000}s`)
      await sleep(wait)
      continue
    }
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error(`gave up on ${url}`)
}

const albumIdFromUrl = (u) => u?.match(/\/album\/[^/]*\/(\d+)/)?.[1] ?? null

console.log(`Fetching top ${COUNT} albums (${MARKET})…`)
const albums = (await getJson(`https://rss.marketingtools.apple.com/api/v2/${MARKET}/music/most-played/${COUNT}/albums.json`)).feed.results
console.log(`Fetching top 100 songs (${MARKET})…`)
const songs = (await getJson(`https://rss.marketingtools.apple.com/api/v2/${MARKET}/music/most-played/100/songs.json`)).feed.results

// album id -> best-ranked chart song name
const hit = new Map()
songs.forEach((s, i) => {
  const id = albumIdFromUrl(s.url)
  if (id && !hit.has(id)) hit.set(id, { name: s.name, rank: i + 1 })
})

const out = []
for (const [i, a] of albums.entries()) {
  process.stdout.write(`${String(i + 1).padStart(2)}/${albums.length} ${a.artistName} — ${a.name} … `)
  let tracks = []
  try {
    const look = await getJson(`https://itunes.apple.com/lookup?id=${a.id}&entity=song&limit=60`)
    tracks = look.results.filter((r) => r.wrapperType === 'track' && r.previewUrl)
  } catch (e) {
    console.warn(`lookup failed: ${e.message}`)
  }
  const want = hit.get(a.id)
  const norm = (s) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const pick = (want && tracks.find((t) => norm(t.trackName) === norm(want.name))) ?? tracks[0]
  if (!pick) {
    console.log('no preview, skipped')
    await sleep(350)
    continue
  }
  const art = (px) => a.artworkUrl100.replace(/100x100bb\.jpg$/, `${px}x${px}bb.jpg`)
  out.push({
    id: `demo-${a.id}`,
    name: a.name,
    artist: a.artistName,
    year: (a.releaseDate ?? '').slice(0, 4),
    cover: art(1500),
    thumb: art(300),
    url: a.url,
    track: pick.trackName,
    trackArtist: pick.artistName,
    previewUrl: pick.previewUrl,
    chartRank: i + 1,
    hitRank: want?.rank ?? null,
  })
  console.log(`▶ ${pick.trackName}${want ? ` (#${want.rank} song)` : ''}`)
  await sleep(350)
}

const file = new URL('../src/demo/demoData.json', import.meta.url)
writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), market: MARKET, albums: out }, null, 2))
console.log(`\nWrote ${out.length} albums → src/demo/demoData.json`)
