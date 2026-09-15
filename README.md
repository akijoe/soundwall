# SOUNDWALL — your most-played albums, wall to wall

Log in with Spotify, get a collage of your most-played albums, rearrange it by
drag & drop (or randomize it), hover any cover to hear its biggest song, and
preview the collage printed on 3D mock-ups: wall flag, poster, t-shirt, mug,
pillow, tote bag, phone case, keychain, mousepad and jigsaw puzzle.
Export a print-ready PNG.

Everything runs in the browser — no server, no database. Your Spotify data
never leaves your machine.

## Run it locally

```bash
node --run dev
```

(`npm run dev` works too.) Open <http://127.0.0.1:5173/> — use the IP, not
`localhost`; Spotify only accepts loopback IPs for http redirect URIs.

The Spotify Client ID is **not** in the repo. Locally it comes from `.env`
(git-ignored — copy `.env.example`); on GitHub Pages it comes from a
repository secret (below). If neither is set, the site shows a setup screen
asking for one.

## Spotify dashboard settings

At <https://developer.spotify.com/dashboard> → your app → **Settings**:

- Redirect URIs must contain **exactly** the URL the site is served from,
  with a trailing slash. Add both:
  - `http://127.0.0.1:5173/` (local dev)
  - `https://<your-github-user>.github.io/<repo>/` (once deployed — see below)
- APIs used: **Web API**.
- Scopes requested at login: `user-top-read`, `user-library-read`,
  `user-read-recently-played`, `user-read-private` (for your country, so song
  previews are looked up in the right store). PKCE flow, no client secret.

Apps start in Development Mode. Since Spotify's
[February 2026 changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
that means: the developer needs Premium, one Development Mode app per
account, up to 5 test users (added under *User Management*), and only
single-resource endpoints + search (limit ≤ 10) — the batch endpoints
(`GET /tracks?ids=`, `GET /albums?ids=`) return 403. SOUNDWALL only uses
endpoints that remain available.

## Deploy to GitHub Pages

Everything is prepared; nothing has been pushed yet.

```bash
git init -b main
git add -A
git commit -m "SOUNDWALL"
gh repo create soundwall --public --source=. --push
gh secret set SPOTIFY_CLIENT_ID --body "<your client id>"
```

The workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))
enables Pages itself on its first run (source: GitHub Actions) and
reads the `SPOTIFY_CLIENT_ID` secret and passes it to the build as
`VITE_SPOTIFY_CLIENT_ID`, so the ID never appears in the source. (You can also
add it under Settings → Secrets and variables → Actions → New repository
secret.) The first run takes about a minute; the site lands at
`https://<user>.github.io/soundwall/` — add that URL (trailing slash!) as a
redirect URI in the Spotify dashboard.

What a secret does and doesn't hide: a Client ID has to reach Spotify from
each visitor's browser, so it is visible in the built JavaScript and the
network tab — that's how the PKCE flow is designed, and it's safe (there is
no client secret in this app, and the redirect URI allow-list stops anyone
using your ID elsewhere). The secret keeps it out of the repository and its
history, which is the part you control.

`vite.config.ts` uses `base: './'`, so the same build works at a domain root
(Netlify/Vercel/Cloudflare: publish `dist/` and set the same env var there) or
under a sub-path.

## How "top albums" are computed

Spotify has no top-albums endpoint. Every top track (short/medium/long term,
up to 100 each) votes for its album weighted by rank and range; saved albums
and recently played tracks pad out the pool. The time-range chips re-rank
everything: **mix** blends all three ranges, the others focus on one.

## Cover quality

The Web API tops out at 640×640, but Spotify's CDN also serves a 1500×1500
rendition of most covers (image id prefix `ab67616d000082c1` instead of
`ab67616d0000b273`). The studio tries that first and falls back to 640.
Tiles with the 1500px version show a **1500px** badge; a 4×4 export is
6000×6000 px (≈20 in at 300 dpi).

## Hover audio

Hovering a cover for a quarter second plays the album's most popular song
from its most intense part. Moving the pointer away (or dragging) does not
stop it — the song only changes when you hover another cover, and a clip
that runs to its end fades out. **Click a tile to pin it**: a pushpin drops
onto the tile and hovering other covers is ignored until you pin another
tile, click the × on the pill, deselect the tile, or the clip ends (on touch
devices, tapping is how you play).
Everything on the collage is prefetched right after loading (lookups are
staggered to respect the iTunes rate limit; clips are ~1 MB and land in the
browser's HTTP cache), so hovers usually start instantly. The volume slider
in the header (also in the now-playing pill) defaults to 30% and is
remembered per browser; the speaker icon mutes.

How it works, and why it's built this way:

1. **Which song** — for albums that came from your top tracks or recent
   plays, it's the song *you* play most on that album (already known from
   the data loaded at start — no extra call). For albums you merely saved,
   one `GET /search?q=album:"…" artist:"…"&type=track` call ranks its songs
   by Spotify `popularity`. (The batch `/tracks?ids=` endpoint would be
   ideal but is a 403 for Development Mode apps since March 2026.)
2. **The audio** — Spotify removed 30-second preview URLs for apps created
   after Nov 2024, so the clip is looked up on the **iTunes Search API** (your
   Spotify country's store, then the US store) and **Deezer** in parallel;
   every candidate is scored on title + artist (covers, remixes and live
   versions are penalised) and the best one wins. Results are cached in
   localStorage. If nothing matches, the pill says "no preview" instead of
   playing a wrong song.
3. **The hook** — the clip is decoded with the Web Audio API and scanned for
   the 7-second stretch with the highest RMS energy; playback starts at the
   quiet moment just before it. It's a heuristic, not chorus detection, but
   30-second previews are already cut around the hook, so it lands well. If a
   browser can't decode the clip, a plain `<audio>` element plays it from the
   start instead.
4. **Visualizer** — an `AnalyserNode` drives the EQ bars in the bottom pill
   and a bass-reactive ring around the tile.

Browsers block audio until the page has been clicked once; the pill says
"click anywhere to turn on sound" if that happens.

## Controls

- **Drag** tiles to reorder; drag albums from the library onto a tile to
  swap them in; drag a tile back to the library (or hit its ×) to remove it.
- **Click** a tile, then click a library album, to place it without dragging.
- Keyboard: focus a tile, press **space**, move with **arrows**, space again.
- **Randomize** shuffles; **reset to top** restores the ranked order.
- Grid sizes: 4×4 (16), 8×4 (32), 5×3, 6×4, 5×5, 6×6, 10×5.
- Gap, corner radius and background (incl. holographic/chrome) apply to the
  export and the product previews.
- **Download PNG** renders the full-resolution collage; **copy** puts a
  smaller copy on the clipboard.

## Design notes

Quiet Y2K futurism: a chrome wordmark set in Syncopate with an orbit ring,
Instrument Serif italics for taglines and prices, Bricolage Grotesque for the
interface, Azeret Mono for numbers only. Ice-blue glass panels, a chrome
planet in a wireframe globe, a faint perspective grid and lens flare. All
animation is CSS/WAAPI/three.js; `prefers-reduced-motion` turns it down.

Support link: the footer and the post-export dialog carry a Ko-fi button
(rendered as a plain link — the official widget uses `document.write`, which
doesn't work inside a React app).

## 3D models & credits

Most mock-ups are built from primitives in
[Products.tsx](src/components/preview/Products.tsx). Two use scanned models in
`public/models/`:

- **Wall flag** — geometry and normal map from
  ["American wall flag"](https://sketchfab.com/3d-models/american-wall-flag-da80c481fae84ce98536ce97c75b14cf)
  by [exiS7-Gs](https://sketchfab.com/exiS7-Gs), licensed
  [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). The 81 MB of
  original 8K textures are replaced by the live collage (colour) and a 1.5K
  normal map; the folds are baked into the mesh, so nothing animates.
- **iPhone 17 Pro case** — an STL-derived shell (no UVs); the print is
  projected flat onto the outer back plate, everything else is plain.

## Stack

Vite · React 19 · TypeScript · dnd-kit · three.js / react-three-fiber / drei
· Web Audio API
