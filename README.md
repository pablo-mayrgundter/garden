# 🌿 Herb Garden

A small app for tracking our herb garden: what's planted in each cell, when to water, thin, feed, transplant and harvest, plus notes, photos and an AI garden assistant.

It's a static site (Vite + React) hosted on GitHub Pages. Everything you enter is stored **in your browser on your device** (IndexedDB); nothing is uploaded anywhere.

On first open, the app sets up the garden from our handwritten plan and seed packets (`seed/photos/`):

| Seed tray | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| **A** | Rosemary | Thyme | Dill | Basil |
| **B** | Oregano | Cilantro | Parsley | Sage *(instead of marjoram)* |
| **C** | Lavender (1–2C) | | Mint (3–4C, seeds coming) | |
| **D** | Cauliflower | Broccoli | Bunching onion | Lettuce |

The **egg carton** (3 × 6 cups) starts empty, ready for the next planting. Aloe is in the seed library but not planted.

## Features

- **Today**: everything that needs doing, grouped so one tap waters a whole tray, plus what's coming up in the next two weeks and your own reminders.
- **Care schedule per plant**: built from each packet's back: daily misting while seedlings are in the tray, the germination window, then thinning, first feeding, pinching, potting up, transplanting and harvest windows. Logging the matching event ("thinned", "transplanted", …) checks a step off.
- **Planters**: a picture of each tray laid out cell by cell, using our own photos. Tap an empty cell to plant it.
- **Plant pages**: hero photo, care log, notes, photo gallery (photos are shrunk on the phone before saving), packet front and back, packet facts, and a summary from Wikipedia with a link to the full article.
- **Seed library**: one entry per packet. Edit it, or add new ones (mint is a placeholder until the packet arrives).
- **Garden assistant**: a chat panel on every page. It knows which page you're on and gets that plant's packet data, schedule, care log, notes and latest photo, plus an overview of the whole garden. It can log care ("we misted the tray"), save notes, set reminders, fix sow dates, and look at any photo. Anything it records is marked "via assistant" and can be deleted.
- **Gardeners**: on first open you pick who's gardening on that device. Your name goes on everything you log.
- **Backups**: Settings → *Download backup* saves the whole garden, photos included, as one file. *Restore from backup* loads it on another device, or back onto the same one.

> **Sow date:** we didn't write down the date we sowed the seed tray. The app guesses **Oct 5, 2026** from how far along the seedlings were in the Oct 14 photo, and marks the date as an estimate. Fix it on any planting page, or tell the assistant.

### About local storage

- Each browser on each device has its **own copy** of the garden. Two people on two phones won't see each other's entries automatically. For now, share by sending a backup file and restoring it.
- Clearing the browser's site data deletes the garden, so download a backup now and then.
- PR previews run at a different URL from the main site, so each preview starts with a fresh garden and never touches the real one.
- The assistant calls Claude directly from the browser using an Anthropic API key you paste into Settings. The key is stored only on that device and isn't included in backups.

A server-side backup and sync is planned for later. All changes already go through one place (`src/lib/actions.ts`, then `src/lib/store.ts`), and records use random string ids, so a sync backend can be added without changing the pages.

## GitHub Pages setup (one time)

1. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions*. The deploy workflows push to the `gh-pages` branch, and the preview workflow comments on PRs.
2. Get a first deploy onto `gh-pages`, either by merging to `main` or by running **Actions → Deploy to GitHub Pages → Run workflow**. Any PR also creates the branch through its preview.
3. **Settings → Pages → Build and deployment**: set *Source* to **Deploy from a branch**, branch **`gh-pages`**, folder **`/ (root)`**, then save.
4. The site is served at **https://pablo-mayrgundter.github.io/garden/**, and each PR at **…/garden/pr-preview/pr-N/**. The preview action posts a comment on the PR with the link and removes the preview when the PR closes.

Workflows (same setup as our other projects):

- `.github/workflows/pages.yml`: on push to `main`, builds and publishes to the root of `gh-pages`, keeping `pr-preview/`.
- `.github/workflows/pr-preview.yml`: on each PR, builds with the preview base path and deploys with [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action).
- `.github/actions/build`: shared install → test → build step.

## Development

Requires Node ≥ 22.18.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # schedule + storage tests (node:test, fake-indexeddb)
npm run build        # typecheck + static build into dist/ (set BASE_PATH=/garden/ to mimic Pages)
npm run crop-images  # re-crop public/seed/* from the original photos (needs Python + Pillow)
```

- `src/lib/seed-data.ts`: the plants, packet info, care milestones and initial plantings.
- `src/lib/schedule.ts`: turns packet data and the care log into the schedule.
- `src/lib/store.ts`: IndexedDB storage, first-run seeding, backup export/import.
- `src/lib/actions.ts`: every change to the garden, used by both the UI and the assistant.
- `src/lib/assistant.ts`: assistant context, tools and the tool loop. Conversations are stored append-only, and the system prompt and tools stay fixed, so prompt caching keeps working.
