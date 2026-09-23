# Screenshots

README images. All show test/fixture data only — never capture a real
device serial or real package names here.

| File | What it shows |
| ---- | ------------- |
| `dashboard.png` | Dashboard — stats, device card, last scan, 12-check overview |
| `scan-live.png` | Scan view mid-run — network graph, live check progress |
| `safety-first.png` | Safety-first choice screen (from a fixture stalkerware match) |
| `history.png` | History list with risk badges |

How they were captured: dev-mode Electron driven by Playwright
(`page.click` through nav → scan → history → detail → review), with a
fresh `--user-data-dir` profile holding crafted `VERIFY-*` scan records
(fake `TEST-DEVICE-01` identity), plus a real device attached for the
mid-scan shot. Live-serial text in the top bar was neutralized via DOM
before each shot. App window 1280×840.
