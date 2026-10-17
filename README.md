# 🌿 Herb Garden

A small app for tracking a garden: what's planted in each cell, when to water, thin, feed, transplant and harvest, plus notes, photos, a calendar and an AI garden assistant.

It's a static site (Vite + React) hosted on GitHub Pages. **No garden data ships with the app.** Every garden lives only in the browser that created it (IndexedDB). It starts empty or from a garden file, and you can download it as a file at any time.

## Features

- **Today**: everything that needs doing, grouped so one tap waters a whole planter, plus what's coming up in the next two weeks and your own reminders.
- **Calendar**: a month view with one short line per entry: what was done (care log, sowings), what's planned (schedule steps), what's overdue, and reminders. Tap a day for the full list.
- **Planters**: each one is drawn cell by cell from a small markdown table (rows are letters, columns are numbers, each cell names a plant). See below.
- **Care schedule per plant**: built from the packet info in the seed library: daily misting while seedlings are in a planter, the germination window, then thinning, first feeding, pinching, potting up, transplanting and harvest windows. Logging the matching event checks a step off.
- **Plant pages**: care log, notes, photo gallery (shrunk on the device before saving), packet photos and facts, and a Wikipedia summary with a link to the full article.
- **Garden assistant**: a chat panel on every page that knows which page you're on. It can log care, save notes, set reminders, fix sow dates, rewrite planter layouts and look at photos. Run it with **Claude** (your API key) or a **local model through Ollama**.
- **Garden file**: Settings → *Download garden file* saves everything, including photos and assistant chats, as one JSON file. *Open a garden file* loads it on another device or another copy of the app. It also works from the first-visit screen.

### Planters as markdown

```markdown
# Seed tray

16-cell seed tray with humidity dome

|   | 1           | 2        | 3              | 4       |
|---|-------------|----------|----------------|---------|
| A | Rosemary    | Thyme    | Dill           | Basil   |
| B | Oregano     | Cilantro | Parsley        | Sage    |
| C | Lavender    | Lavender | Mint           | Mint    |
| D | Cauliflower | Broccoli | Bunching Onion | Lettuce |
```

- The `#` heading is the planter's name, and the next line describes it.
- The same name in neighboring cells of a row is one planting spanning them (lavender in 1–2C).
- Leave a cell blank (or `-`) when it's empty.
- Names are matched against the seed library, and unknown names are added to it.

On a planter's page, *Edit layout as a table* shows the current layout in this format. When you save it, the app works out what changed:

- Plantings that are still there are kept.
- Plantings that shifted within their row are moved, with their history.
- New ones are added as *planned*.
- Removed ones are deleted if they have no history. If they do have care-log entries, notes or photos, they're kept outside the planter.

### Using a local model (Ollama)

The browser talks to Ollama directly, so no extra server is needed.

1. Allow this site's address in Ollama, then start it:
   ```bash
   OLLAMA_ORIGINS="https://pablo-mayrgundter.github.io" ollama serve
   # Mac app instead: launchctl setenv OLLAMA_ORIGINS "https://pablo-mayrgundter.github.io", then restart Ollama
   ollama pull gemma4:12b
   ```
2. In **Settings → Garden assistant**, choose *Local model (Ollama)*. The server defaults to `http://localhost:11434` and the model to `gemma4:12b`. Press *Test connection*.
3. Use Chrome, Edge or Firefox on the same computer as Ollama. Chrome may ask to let the site reach your local network; allow it. Safari won't let a secure site call `http://localhost`; there, run the app locally with `npm run dev`.

The app asks Ollama for a 16k-token context and sends a shorter history than it does to Claude. If the model can't call tools, the app falls back to plain chat and says so.

A phone can't reach `localhost` on your computer. Using a local model from a phone would need the Ollama server exposed over HTTPS (for example with `tailscale serve`), with that address entered in Settings.

## GitHub Pages and PR previews

- `.github/workflows/pages.yml`: on push to `main`, builds and publishes to the root of the `gh-pages` branch, keeping `pr-preview/`.
- `.github/workflows/pr-preview.yml`: builds each PR into `…/garden/pr-preview/pr-N/` with [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action) and removes it when the PR closes.
- `.github/actions/build`: the shared install → test → build step.

Each preview runs at its own address, so it has its own browser storage: it starts empty and never touches the real garden.

## Development

Requires Node ≥ 22.18.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # schedule, storage, planter markdown and calendar tests (node:test, fake-indexeddb)
npm run build   # typecheck + static build into dist/ (BASE_PATH=/garden/ mimics Pages)
```

- `src/lib/store.ts`: IndexedDB storage, garden files, and the one-time photo migration.
- `src/lib/actions.ts`: every change to a garden, used by both the UI and the assistant. Planter layouts are applied here.
- `src/lib/trayMarkdown.ts`: parses and writes planter tables.
- `src/lib/schedule.ts` and `src/lib/calendar.ts`: the care schedule, and the calendar entries built from it.
- `src/lib/assistant/`: `core.ts` (context, tools), `claude.ts` and `ollama.ts` (backends).

`public/seed/` still holds the photos bundled with the first version. Gardens created then are copied into browser storage on their next visit, and the folder will be removed once that has happened on every device in use.
