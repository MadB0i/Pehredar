# Demo GIF storyboard (human task — ~20 minutes)

Goal: a 15–20 second `screenshots/demo.gif` for the README showing a real
scan end to end: plug → checklist ticking → risk reveal. This sells the
tool to non-technical reviewers better than any screenshot.

## Prep

- Phone connected, authorized, USB debugging on.
- Open Pehredar, go to the **Scan** tab. Close other windows.
- Privacy: the device serial shows in the top bar — blur it in the editor
  afterwards, or cover it with the checklist card while recording.

## Shot list (single continuous take, then trim)

| Time | Action |
| ---- | ------ |
| 0–2s | Hold on the Scan tab, cursor over **New Scan**. |
| 2–3s | Click **New Scan**. Checklist rows cascade, radar sweep starts. |
| 3–14s | Let the checklist tick (real time — don't cut mid-scan, the live progress is the point). |
| 14–17s | Risk reveal: badge pop + count-up. Hold 2s. |
| 17–20s | Slow scroll down through 2–3 result rows. Stop. |

## Recording (Windows)

1. Install **ScreenToGif** (free) or use ShareX → Screen recording (GIF).
2. Record the app window region at ~800×500, **15 fps**.
3. Editor: trim dead ends, blur the serial, drop accidental frames.
4. Save as GIF, 256 colors, aim **< 5 MB** (README-friendly).

## After recording

Drop the file at `screenshots/demo.gif` and tell the assistant — the README
embed line (`![Demo scan](screenshots/demo.gif)` under Screenshots) goes in
with the same commit. Don't commit a 50 MB GIF; re-export smaller first.
