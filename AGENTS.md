# AGENTS.md

## Band genre lookup (for bands not in the index)

When a band is not listed on the Black Metal Sketchbook index, determine its genre before flagging it:

1. Check `band-genres.json` for the band name. If present, use the cached black-metal status (`true`/`false`) and skip to step 5.
2. Look up the band on Metal Archives: `https://www.metal-archives.com/bands/<band_name>` (spaces as underscores).
3. Read the `genre` field in the `band_stats` table on that page.
4. Record the result in `band-genres.json`: the band name mapped to `true` if the genre includes **Black Metal**, otherwise `false`.
5. Only if the band is Black Metal, search Reddit for the band on `/r/isitsketch` and `/r/rabm` and list the resulting threads.
6. If the band is not Black Metal, skip the Reddit step (it is out of scope for this project).
