# TagFlow

TagFlow is a desktop music tagger for local audio files. It scans what is already in your files, falls back to filename cleanup when tags are messy or missing, looks up likely matches from Apple Music/iTunes, falls back to Spotify on desktop when configured, and lets you review the result before anything is written.

The current app targets Windows packaging through Electron and NSIS, with a browser-friendly fallback for local development and preview.

## What TagFlow Does

- Imports local `MP3`, `M4A`, and `FLAC` files
- Reads existing metadata and embedded artwork
- Builds a search query from current tags or the filename
- Searches Apple Music/iTunes for likely matches
- Falls back to Spotify lookup on desktop when Apple is unavailable and Spotify credentials are configured
- Scores each match by title, artist, album, and duration
- Shows current metadata beside the suggested result
- Lets you apply one match at a time or batch-apply high-confidence matches
- Writes desktop tags directly back into the original file
- Downloads a tagged copy instead of overwriting when running in browser-only mode

## Current Tagging Scope

TagFlow writes standard music metadata across supported formats and writes richer Apple-style atoms for `M4A` files when the source data is available.

Core tags written:

- Title
- Artist
- Album
- Genre
- Release date / year
- Track number and total
- Disc number and total
- Album artist
- Composer
- Publisher / label
- Copyright
- Lyrics
- Embedded cover art

Additional Apple-style `M4A` tags:

- Title sort
- Artist sort
- Album sort
- Album artist sort
- Composer sort
- Performer
- Content type
- Rating / explicit flag
- ISRC
- UPC
- Apple storefront ID
- Apple artist ID
- Apple album / playlist ID
- Apple track / catalog ID
- Vendor string

Cover art behavior:

- TagFlow prefers `1200x1200` artwork where Apple exposes it publicly.

## Matching Pipeline

TagFlow currently uses a staged lookup flow:

1. Read the local file with `music-metadata`
2. Clean the filename if the existing tags are weak
3. Search the iTunes Search API for candidate tracks
4. Fall back to Spotify search on desktop when Apple lookup is unavailable or empty and Spotify credentials are configured
5. Enrich Apple-sourced matches with public Apple Music page data
6. Fill gaps from public lyrics and recording metadata sources when available
6. Write the final tag set with `taglib-wasm`

This keeps matching fast while still letting the writer produce a richer final result.

## Metadata Sources

TagFlow currently pulls data from these public sources:

- iTunes Search API for initial track matching
- Spotify Web API for desktop fallback matching when `TAGFLOW_SPOTIFY_CLIENT_ID` and `TAGFLOW_SPOTIFY_CLIENT_SECRET` are set
- Apple Music public pages for album details, artwork, composer, copyright, and Apple IDs
- LRCLIB for synced or plain lyrics when available
- MusicBrainz as a fallback for ISRC when Apple public data does not expose it

## Supported Formats

- `MP3`
- `M4A`
- `FLAC`

Write support:

- Desktop Electron app: in-place tagging for all three formats
- Browser-only preview: tagged copy is downloaded instead of overwriting the original file

## Desktop Lookup Setup

Spotify fallback is desktop-only and uses official Spotify API credentials from the local environment:

- `TAGFLOW_SPOTIFY_CLIENT_ID`
- `TAGFLOW_SPOTIFY_CLIENT_SECRET`

If those variables are not set, desktop lookup stays Apple-only and the browser preview remains Apple-only.

## Using The App

1. Launch TagFlow.
2. Drag files in or click `Choose Files`.
3. Review the current metadata and top suggestion.
4. Use `Search Manually` if the top match is wrong.
5. Apply a single match or use `Apply All High Confidence`.

## Development

### Prerequisites

- A recent Node.js LTS release
- `npm`

### Install

```bash
npm install
```

### Start The App

```bash
npm run dev
```

This starts the Vite-based Electron development flow.

### Production Build

```bash
npm run build
```

This runs TypeScript checks and builds:

- `dist/` for the renderer
- `dist-electron/` for the Electron main and preload bundles

## Windows Installer

Build the NSIS installer with:

```bash
npm run dist:win
```

Output:

- `release/TagFlow-Setup-<version>.exe`
- `release/TagFlow-Setup-<version>.exe.blockmap`

The packaging script is:

- [scripts/dist-win.cmd](scripts/dist-win.cmd)

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- `taglib-wasm`
- `music-metadata`
- `electron-builder`

## Project Layout

- [src/App.tsx](src/App.tsx): main app shell and tagging flow
- [src/components](src/components): UI panels, queue, modal, preview
- [src/lib/itunes.ts](src/lib/itunes.ts): search and metadata enrichment
- [src/lib/tagging.ts](src/lib/tagging.ts): shared tag payload builders
- [src/lib/browserFileService.ts](src/lib/browserFileService.ts): browser-side import and export path
- [electron/file-service.ts](electron/file-service.ts): desktop file scanning and manual search
- [electron/lookup-service.ts](electron/lookup-service.ts): desktop Apple/Spotify lookup pipeline
- [electron/tag-service.ts](electron/tag-service.ts): desktop write path

## Known Limitations

- Apple-specific fields are limited by what public sources expose.
- Some private Apple Store atoms are still not populated reliably.
- The richest Apple-style output is currently on `M4A`.
- Lyrics depend on public availability and may be missing or unsynced for some tracks.
- Matching is strong for common catalog releases, but obscure, live, bootleg, or misnamed files may still require manual search.

## Status

TagFlow is functional and can already tag local files safely, but it is still early-stage software. Expect the metadata pipeline to continue evolving, especially around Apple-specific atoms and catalog edge cases.
