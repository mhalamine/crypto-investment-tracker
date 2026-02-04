# Crypto Investment Tracker

<img width="1452" height="761" alt="screenshot-alamine me-2026-02-04-12-26-10-784" src="https://github.com/user-attachments/assets/a7579bdb-21e4-435b-a7fb-a488b8480daa" />

Single-page, offline-friendly crypto portfolio tracker built with vanilla HTML/CSS/JS. It lets you log buys and sells, computes average cost, tracks realized/unrealized P&L, and visualizes your portfolio with Chart.js. Live pricing comes from the public CoinPaprika API; all data stays in the browser via `localStorage`.

## Features
- Log buy and sell transactions with fees, notes, and timestamps (with keyboard-accessible tabs).
- Quick coin search from the top 1,000 CoinPaprika assets; manual entry also supported.
- Live USD pricing for assets with a CoinPaprika ID, cached for 15 minutes; graceful estimates when missing.
- Portfolio metrics, holdings table, and seven Chart.js visualizations (allocation, value vs. invested, unrealized/realized P&L, holdings over time, cost basis vs. value, buy vs. sell volume, ROI by coin).
- History filters (coin, type, free-text), inline delete, and CSV export.
- Local backups (download/restore JSON) plus local `Export CSV` for spreadsheets.
- PWA-ready: manifest + service worker for offline reuse and caching of static assets.

## Tech Stack
- Vanilla HTML, CSS, and JavaScript (no build step).
- Chart.js 4.4.1 (CDN).
- CoinPaprika REST API for coin list and live prices.
- Service worker + `localStorage` for persistence/offline use.

## Getting Started
1) From the project root, run a local static server (required for the service worker):
   - With Python: `python3 -m http.server 4173`
   - Or with npm serve: `npx serve .`
2) Open http://localhost:4173 (or the URL your server prints).
3) Add the app to your home screen or desktop for offline access after the first load.

### Save as a PWA (Install)
- **Desktop (Chrome/Edge):** Open the app, click the “Install app” icon in the address bar, then confirm.
- **Android (Chrome):** Open the URL, tap the overflow menu (`⋮`), choose “Install app” or “Add to Home screen.”
- **iOS (Safari):** Open the URL, tap the Share icon, then “Add to Home Screen.” Launch from the new icon to use the PWA shell.
- After installation, the app works offline using the cached assets and your local data.

## Usage Tips
- Adding prices: include the CoinPaprika ID (auto-filled when selecting a search result) to enable live updates. Without an ID, the app falls back to your last trade price for that asset.
- Refresh prices: `Settings → Refresh Prices` (respects 15-minute cache).
- Selling: the sell form only lists assets with current holdings and prevents overselling.
- Filters: use the History filters to search by coin, type, or text in notes.
- Backups: `Settings → Download Backup` saves a JSON snapshot; `Restore Backup` will overwrite current data after confirmation. CSV export is separate and meant for spreadsheets.

## Data & Privacy
- All portfolio data is stored locally in your browser (`localStorage`) and never sent to a server.
- Clearing browser data (or hitting `Clear All`) removes your transactions; keep a backup JSON if needed.

## Project Structure
- `index.html` – UI layout, tab panels, and Chart.js canvases.
- `styles.css` – Theme, layout, and responsive styling.
- `app.js` – State management, pricing fetches, calculations, charts, backups/exports, and event handlers.
- `service-worker.js` – Caches static assets; network-first for HTML, stale-while-revalidate for CDN assets.
- `manifest.json` and `icons/` – PWA metadata and icons.

## Troubleshooting
- Service worker not registering: ensure you’re using `http://localhost` or HTTPS, not a `file://` URL.
- No live prices: verify the coin has a CoinPaprika ID and that you’re online when refreshing.
- Charts empty: add at least one transaction; some charts appear only when holdings exist.

## License
MIT License — see `LICENSE`.
