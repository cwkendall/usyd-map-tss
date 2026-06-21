---
description: Geocode any facility locations that are missing coordinates
---

Fill in coordinates for new buildings / off-campus sites added to the workbook.

Run:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)" && cd /Users/rbar3075/Claude/Usyd/UsydMapTSS && npm run geocode
```

This compares `Map Data` location keys against the `Buildings` sheet and geocodes
only the missing ones (via OpenStreetMap Nominatim), appending them to `Buildings`
flagged amber for verification. It never overwrites existing coordinates.

After it runs: report which locations were added (and any `NOT FOUND` that need manual
lat/lon). Tell the user to open the `Buildings` sheet, verify/adjust the amber rows,
then run `/build-data`.
