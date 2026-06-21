---
description: Refresh OSM building footprints for facility buildings
---

Regenerate `public/data/facility-footprints.geojson` — the real building outlines
used to highlight facility buildings — from OpenStreetMap.

Run:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)" && cd /Users/rbar3075/Claude/Usyd/UsydMapTSS && npm run footprints
```

For each building in the `Buildings` sheet (with coordinates), it finds the matching
OSM building footprint (containing the point, else nearest within ~60 m) and writes
one polygon per building, tagged with its key.

This file is committed (it comes from OSM, not the workbook, and CI does not regenerate
it). After running: report how many footprints were written and which buildings had
none (they fall back to a circle highlight — usually regional/placeholder sites).
Re-run this when buildings are added or their coordinates change.
