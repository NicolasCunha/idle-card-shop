# Fixes to carry into the Godot port

Every fix or change made to the web game must also be applied to the desktop (Godot) port (Nicolas, 2026-11-28). Add one entry per fix, newest first, with the web version, the commit and what the port needs. Mark an entry `ported` once the port has it.

| Web version | Commit | Change | What the port needs | Port |
| --- | --- | --- | --- | --- |
| 1.9.7 | see git log | Loading screen with steps (Game code, Card collections N / total, Tutorial, News, Accessories, Save); collection files fetched in parallel instead of one by one. | A loading screen listing the same steps with progress, and parallel or threaded loading of collection files. | pending |
| 1.9.6 | 0a75710 | Staff buyer: stock target limits only the shop; with a warehouse, the buyer keeps buying into it until it is full or the cash reserve is reached. Status `warehouse full`. | Same buy-job rule (`doTask` buy in `js/game.js`). | pending |
| 1.9.5 | b3603b7 | Fire staff: severance = current salary per day x ceil(days at shop / 6), at least one day; booked as salaries; needs the cash; confirm box. | Fire button per employee, same formula. | pending |
| 1.9.4 | ea6af8f | With the shop full, every purchase (distributor and Market boosters, boxes, accessories) goes to the warehouses (`roomFor`). Shop shows `to warehouse`. | Same overflow rule. | pending |
| 1.9.3 | 3ccf4d2 | Market tab slow with 30 collections: price cache per card (last 64 days) and market events cached per (card, window). | Cache card prices and events the same way; no shared cache that thrashes. | pending |
| 1.9.1 | 2e26d2d | News in two tabs (Game news, Updates); Updates always complete; collection notes join the release notice; next release shown. Debug: Release all sets (device pref, never saved). | Same News layout and debug button. | pending |
| 1.9.0 | 7985ccb | Card values from `tools/balance.py` (data only). | Nothing in code: use the collection JSON as is. | pending |
