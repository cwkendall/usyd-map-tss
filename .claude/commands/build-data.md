---
description: Rebuild map data (GeoJSON) from the Excel workbook
---

Regenerate the map's data files from `TSS-CRF-MapData.xlsx`.

Run:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)" && cd /Users/rbar3075/Claude/Usyd/UsydMapTSS && npm run build:data
```

Then report the feature counts and any warnings from the output (and from
`public/data/build-report.json`). Flag any facility that failed to get coordinates
(usually a Building Code or Location name in `Map Data` that has no matching row in the
`Buildings` sheet).
