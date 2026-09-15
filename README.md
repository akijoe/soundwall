# SOUNDWALL

**https://akijoe.github.io/soundwall/**

Log in with Spotify and your most-played albums become a cover-art collage.
Rearrange it by drag & drop, hover any cover to hear its biggest song, and see
the collage printed on a wall flag, poster, t-shirt, mug, pillow, tote bag,
phone case, keychain, mousepad or jigsaw puzzle. Download a print-ready PNG.

Everything runs in your browser — no server, nothing stored. No account? The
demo uses this week's most-played albums.

## Run locally

```bash
cp .env.example .env   # add your Spotify Client ID
node --run dev         # http://127.0.0.1:5173/
```

Create the app at [developer.spotify.com](https://developer.spotify.com/dashboard)
with `http://127.0.0.1:5173/` as a redirect URI and Web API enabled.

## How it works

- **Which albums** — Spotify has no top-albums endpoint, so every top track
  votes for its album (three time ranges, weighted by rank); saved albums and
  recent plays fill the pool.
- **Cover quality** — the API stops at 640 px, but Spotify's CDN also serves a
  1500 px rendition of most covers; the site uses it when it exists.
- **Previews** — the song is the one *you* play most on that album; the
  30-second clip comes from iTunes or Deezer (Spotify no longer provides
  them), and starts at the clip's loudest stretch.

## Credits

- Wall flag model: ["American wall flag"](https://sketchfab.com/3d-models/american-wall-flag-da80c481fae84ce98536ce97c75b14cf)
  by [exiS7-Gs](https://sketchfab.com/exiS7-Gs), [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
  (textures replaced; geometry and a downscaled normal map used).
- Phone case model: ["iPhone 17 Pro Phone Case"](https://sketchfab.com/3d-models/iphone-17-pro-phone-case-4883a95f86ea4835880ea8c7bcf614ba)
  by [Henrybenrydude657](https://sketchfab.com/Henrybenrydude657) (no licence
  listed on Sketchfab).
- Not affiliated with Spotify or Apple. Album covers belong to their owners.
