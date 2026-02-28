# KQL Practice

An interactive progressive web app for mastering **Kusto Query Language (KQL)** — the query language used in Azure Monitor, Microsoft Sentinel, Log Analytics, and Azure Data Explorer.

## Features

- **420+ questions** across 5 difficulty levels
- **Two question types**: Fill in the Blank and Arrange Tokens (drag-and-drop)
- **Red-herring distractors** in token questions to increase challenge
- **Progressive difficulty** from basic `where`/`project` to expert security detection scenarios
- **Save & resume** — progress persists in `localStorage` so you can close the app and continue later
- **Retry wrong answers** at half points to reinforce learning
- **Score system** — 10 pts (correct), 5 pts (correct + hint used), 5/3 pts in retry mode
- **PWA** — installable on iPhone/Android home screen, works offline after first load
- **Mobile-first** — optimized for iPhone 16 Pro, Dynamic Island safe areas, `100dvh` layout

## Question Levels

| Level | Theme | Examples |
|-------|-------|---------|
| 1 | Basics | `take`, `project`, `where`, `count`, `extend` |
| 2 | Filtering & Sorting | `order by`, `top`, `distinct`, `between`, `contains` |
| 3 | Functions & Aggregations | `summarize`, `bin()`, `ago()`, string functions, time math |
| 4 | Joins & Parsing | `join`, `union`, `parse`, `mv-expand`, `let`, `lookup` |
| 5 | Expert Scenarios | Brute-force detection, impossible travel, Kerberoasting, DCSync, beaconing |

## Question Types

### Fill in the Blank
A KQL query is shown with one or more `___` blanks. Type the missing keyword, operator, or value into the input box. Answers are case-insensitive.

```kql
SecurityEvent
| where EventID == ___
| project TimeGenerated, Account, Computer
```

### Arrange Tokens
A set of KQL tokens is displayed in random order — including 3 plausible red-herring distractors. Tap tokens to build the correct query in the answer area. Tap a placed token to return it to the bank.

## Scoring

| Scenario | Points |
|----------|--------|
| Correct (no hint) | 10 |
| Correct (hint used) | 5 |
| Correct on retry (no hint) | 5 |
| Correct on retry (hint used) | 3 |
| Skipped / Wrong | 0 (added to retry list) |

## Tech Stack

- Pure HTML / CSS / JavaScript — no framework, no build step
- Service Worker for offline caching (`sw.js`)
- `localStorage` for progress persistence
- `manifest.json` + apple-touch-icon for PWA home screen install
- `100dvh` + `env(safe-area-inset-*)` for iOS Dynamic Island support
- Netlify for hosting (static site, zero config)

## Project Structure

```
KQLApp/
├── index.html          # App shell — 3 screens: welcome, quiz, end
├── app.js              # Quiz engine — state, rendering, scoring, persistence
├── questions.js        # QUESTIONS array — 420 questions (window.QUESTIONS)
├── styles.css          # Dark VS Code-inspired theme, mobile-first
├── manifest.json       # PWA manifest
├── sw.js               # Service worker — cache-first offline strategy
├── netlify.toml        # Netlify config + security headers
├── icon-192.png        # PWA icon (Android)
├── icon-512.png        # PWA icon (splash screen)
└── apple-touch-icon.png # PWA icon (iOS home screen)
```

## Local Development

No build step required. Serve the directory with any static server:

```bash
# Python
python -m http.server 8080

# Node (npx)
npx serve .

# VS Code — use the Live Server extension
```

Then open `http://localhost:8080`.

> **Note:** The service worker only activates over HTTPS or `localhost`. For PWA testing on a real device, deploy to Netlify or use an HTTPS tunnel (e.g., `ngrok`).

## Deploy to Netlify

1. Push the repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
3. Select the repo — publish directory is `.` (root), no build command needed
4. Deploy — Netlify auto-detects `netlify.toml`

Or use the CLI:

```bash
npx netlify-cli deploy --prod --dir .
```

## Adding Questions

Questions live in `questions.js` as entries in the `window.QUESTIONS` array.

**Fill in the Blank format:**
```js
{
  id: 421,
  type: 'fill',
  difficulty: 2,           // 1–5
  topic: 'Filtering',
  question: 'Filter events from the last 7 days.',
  template: 'SecurityEvent\n| where TimeGenerated > ___(7___)',
  answers: ['ago', 'd'],   // one entry per ___ blank; use array for alternates: ['ago', ['d','days']]
  hint: 'ago() takes a timespan like 7d, 1h, 30m'
}
```

**Arrange Tokens format:**
```js
{
  id: 422,
  type: 'drag',
  difficulty: 1,
  topic: 'Basics',
  question: 'Return the first 10 rows from SecurityEvent.',
  answer: ['SecurityEvent', '|', 'take', '10'],  // correct order
  hint: 'take N limits output to N rows'
}
```

The app automatically adds 3 random distractor tokens to every drag question — no need to specify them in the question data.
