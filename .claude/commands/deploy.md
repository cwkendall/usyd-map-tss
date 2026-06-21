---
description: Build, commit, and push to trigger the GitHub Pages deploy
---

Deploy the latest data/app to GitHub Pages.

Steps:

1. Rebuild data and verify the build succeeds locally:
   ```bash
   eval "$(/opt/homebrew/bin/brew shellenv)" && cd /Users/rbar3075/Claude/Usyd/UsydMapTSS && npm run build
   ```
2. Stage and commit (include the updated `TSS-CRF-MapData.xlsx` if it changed):
   ```bash
   cd /Users/rbar3075/Claude/Usyd/UsydMapTSS && git add -A && git commit -m "Update facilities map data"
   ```
3. Push to `main` (the `Deploy to GitHub Pages` Action rebuilds `public/data/*` from the
   workbook and publishes `dist/`):
   ```bash
   git push origin main
   ```
4. Report the Actions run status and the live URL: https://cwkendall.github.io/usyd-map-tss/

Only commit/push when the user has asked to deploy. If on a branch other than `main`, ask
before pushing.
