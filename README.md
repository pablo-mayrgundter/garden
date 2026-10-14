# 🌿 Herb Garden

A small, private, multi-user app for tracking our herb garden: what's planted in each cell, when to water, thin, feed, transplant and harvest, plus notes, photos and an AI garden assistant.

On first run the app sets up the garden from our handwritten plan and seed packets (`seed/photos/`):

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
- **Plant pages**: hero photo, care log, notes, photo gallery (uploads are shrunk in the browser first), packet front and back, packet facts, and a summary from Wikipedia with a link to the full article.
- **Seed library**: one entry per packet. Edit it, or add new ones (mint is a placeholder until the packet arrives).
- **Garden assistant**: a chat panel on every page. It knows which page you're on and gets that plant's packet data, schedule, care log, notes and latest photo, plus an overview of the whole garden. It can log care ("we misted the tray"), save notes, set reminders, fix sow dates, and look at any photo. Anything it records is marked "via assistant" and can be deleted.
- **Multiple users**: everyone in a garden shares it. Invite more people from Settings with an invite link.

> **Sow date:** we didn't write down the date we sowed the seed tray. The app guesses **Oct 5, 2026** from how far along the seedlings were in the Oct 14 photo, and marks the date as an estimate. Fix it on any planting page, or tell the assistant.

## Running it

Requires Node ≥ 22.18.

```bash
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Sign up with an email listed in `OWNER_EMAILS` (default `pablo@bldrs.ai`) to claim the garden. Then send the invite link from **Settings** to other gardeners. Add more owner emails to `OWNER_EMAILS` (comma-separated) if you'd rather they sign up without the link.

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Powers the assistant (Claude Opus 5.5). Without it the rest of the app still works. |
| `DATA_DIR` | Where the SQLite DB and uploaded photos live (default `./data`). |
| `OWNER_EMAILS` | Emails that can join the original garden without an invite. |

Production: `npm run build && npm start`. The app keeps its state in `DATA_DIR` (SQLite + photo files), so deploy it somewhere with a persistent disk (Fly.io volume, Railway volume, a small VPS) and back that folder up. Serverless hosts with ephemeral filesystems (e.g. Vercel) won't keep the data.

## Development

```bash
npm test            # schedule unit tests (node:test)
npm run typecheck
npm run crop-images # re-crop seed/images/* from the original photos (needs Python + Pillow)
```

- `src/lib/seed-data.ts`: the plants, packet info, care milestones and initial plantings.
- `src/lib/schedule.ts`: turns packet data and the care log into the schedule.
- `src/lib/assistant.ts`: assistant context, tools and the tool loop. Conversations are stored append-only in SQLite. Each turn starts with an `<app_context>` block for the page being viewed. The system prompt and tool list stay fixed, so prompt caching keeps working.
- `src/app/actions.ts`: server actions for every form.
