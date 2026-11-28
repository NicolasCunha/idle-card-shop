# Staff routines (design draft, desktop only)

Status: **draft for Nicolas's review (2026-11-28).** Nothing is built yet. Desktop game only (Godot, branch `desktop-port`); the web build is frozen.

## Goal

Let the player build an automation line: a named, ordered list of steps that one or more employees run in a loop. Example from Nicolas: pick the collection with the fewest cards in the binder, buy a booster of it, open it, keep cards I don't own yet, send duplicates to sale; when a collection is complete, move on to the next one.

Today each employee has a primary and a backup job (one action + one collection each). That cannot express "pick a collection by a rule", "do A, then B, then C", or "skip this step when X".

## Name

In game: **Routines** (tab name, button `New routine`). Short, plain English, fits the UI copy rule.

## Decisions (Nicolas, 2026-11-28)

1. Routines and jobs live side by side. An employee is on **either** its jobs (primary/backup) **or** one routine, never both.
2. Old saves stay as they are: jobs kept, no routines (`state.routines = []`, `emp.routine = null`).
3. "Send to the market" is the **Bulk** step.
4. No fixed limit: the routine is a tree of nested If / Else / End blocks, built in a modal editor.

## As built (desktop 2.2.0, save v7)

- Core: `desktop/scripts/core/routines.gd`; hooked in `Game._tick_employee` (an employee with `routine` runs it instead of its jobs). `Game._staff_price_one` takes an optional keep override.
- Steps are a flat list; `If`, `Else`, `End` rows make the tree (`Routines.jumps` gives indent levels and forward jumps). A missing `End` closes at the end of the list; a stray `Else`/`End` is ignored. Jumps only go forward, so one pass always ends and no loop guard is visible to the player.
- Actions: Buy, Open, Price (showcase, keep N), Bulk (sell spares below a value; empty = shop rule, 0 = any card). Each costs its skill time (Bulk uses Price) and gives XP.
- Pickers: Same set, Least complete, Next incomplete, Newest, Any (Price/Bulk), or a fixed collection. "Complete" counts distinct cards **in the binder now** (Nicolas's words: cards I have in my binder), not cards ever discovered.
- Conditions (If): Incomplete, Complete, Has packs, No packs (with a collection picker), Showcase room, Money over X.
- Repeat: x1, x5, All (while it works, at most 50 in a row).
- A step that can't run is skipped; a full pass with no action makes the employee wait, showing the first reason, and try again next tick.
- UI: Staff tab gets a Routines box (shows with 2+ staff) with `New routine` and one button per routine; each employee gets a `Work` picker (Jobs or a routine), and its job rows hide while on a routine. `RoutineEditor` (`desktop/scripts/ui/routine_editor.gd`) is the modal: name, staff on it, Delete, one row per step indented by depth, per row `+` (insert below), up, down, remove.
- New routine template: Buy Least complete x1, Open Same set x1, Price Same set All Keep 1.
- Tutorial rev 12 → 13: `routine` (New routine, when 2 staff) and `routine-staff` (Work picker).

## Original draft

## Model

A routine is:

- `name` (player text, up to 16 characters)
- `steps`: 1 to 8 steps, run top to bottom, then back to the top (one loop)

A step is:

| Field | Values | Default |
|---|---|---|
| Action | `Buy`, `Open`, `Price`, `Bulk` (new, see below) | — |
| Collection | `Fixed: <set>`, `Least complete`, `Next incomplete`, `Newest`, `Same as above`, `Any` (Price/Bulk only) | `Same as above` |
| Only if | `Always`, `Set incomplete`, `Set complete`, `Has packs`, `No packs`, `Showcase has room`, `Money above X` | `Always` |
| Repeat | `Once`, `x5`, `Until it can't` | `Once` |
| Keep | copies to keep (Price/Bulk only) | shop rule `Keep copies` |

Collection pickers (evaluated when the step runs, over released collections only):

- **Least complete**: lowest share of distinct cards in the binder (seen cards / set size). Ties: release order. Complete sets are skipped. Uses share, not raw count, so a 130-card set is not always "behind" a 60-card set.
- **Next incomplete**: first collection in release order that is not complete. This is the "if complete, go to the next one" rule.
- **Newest**: latest released collection.
- **Same as above**: the collection the previous step in this loop used. So Buy picks a set, and Open and Price follow it.

Card-level rule ("if I already own it, sell it; if not, keep it") is the Price/Bulk step with `Keep 1`: it only touches copies beyond the ones kept. No new per-card condition is needed.

New action **Bulk** (uses the Price skill): sells one spare card below the `Bulk below` value to the bulk buyer. Today Price does this implicitly; a separate step lets a line sell junk without filling the showcase.

There is no "sell a single card to the market" action in the game today (the Market only buys/sells boosters). If "send to the market" means that, it is a new mechanic (see question 3).

## How an employee runs a routine

- Each step costs the step's skill duration (Buy/Open/Price speed, as today) and gives XP to that skill.
- A step whose `Only if` is false is skipped at no time cost.
- A step that can't happen (no cash, no packs, showcase full) is skipped and its reason is remembered. If a whole loop does nothing, the employee waits and shows the first reason (`cash reserve`, `no packs`...), checking again each tick. Calm: no penalty.
- `Until it can't`: repeat the step while it succeeds (capped at 50 in a row so a loop always comes back to the top).
- Each employee keeps its own place in the routine (step index and the loop's collection). Several employees on the same routine run it side by side, out of phase. Buys still respect `Stock target`, `Cash reserve` and storage, exactly as today.
- Offline: same tick, same rules. Pickers are cached per binder change so a long offline catch-up stays fast; the sim already runs on the worker thread.

Example routine "Complete sets":

```
1 Buy    Least complete   Always   Once
2 Open   Same as above    Has packs Once
3 Price  Same as above    Always   Until it can't   Keep 1
```

## Primary/backup jobs

Proposal: routines **replace** primary and backup jobs. One concept is easier to learn, and a primary+backup pair is just a 2-step routine (`Job: Until it can't`, then `Backup: Until it can't`). New players get starter routines so nothing gets harder:

- `Buy` / `Open` / `Price` (one step each, collection = shop rule set)
- `Buy & open` (2 steps)

The Staff tab keeps hiring, skills, training, salary and firing; the two job rows become one `Routine` picker per employee.

## UI (640×360, GBA pixel style, existing palette and themes)

New tab **Routines**, unlocks with the Staff tab. Left: list of routines (name, staff count). Right: the selected routine.

```
+-- Routines ---------------------------------------------------------+
| > Complete sets  3 |  Complete sets              [Rename] [Delete]  |
|   Buy & open     1 |  1 [Buy  v] [Least complete v] [Always   v] [Once  v]   ^ v x |
|   Price          0 |  2 [Open v] [Same as above  v] [Has packs v] [Once  v]  ^ v x |
|                    |  3 [Price v] [Same as above v] [Always   v] [Until v] K1 ^ v x |
| [New routine]      |  [Add step]                                     |
|                    |  Staff: Ada, Ben, Cleo     [Assign v]           |
+---------------------------------------------------------------------+
```

Staff card: `Routine [Complete sets v]`, status shows the current step (`2 Open`, `cash reserve`). Tooltips explain pickers and conditions; panels carry no instructions (ui-copy rule).

## Tutorial

New step when the Routines tab unlocks: "Make a routine." (target `New routine`), then "Give it to an employee." (target the staff routine picker). Tutorial revision bumps by one. Progressive reveal table updated.

## Save impact (needs Nicolas's decision)

New save v7 (first desktop-only field, as agreed in the migration plan; the web build cannot read v7).

- `state.routines`: list of `{id, name, steps}`. Old saves: see question 2.
- `emp.routine`: routine id or null.
- `emp.task`, `emp.set`, `emp.task2`, `emp.set2`: dropped after migration (names never reused).
- `state.rules.buySet` / `openSet`: still used by starter routines (`Shop set`) or dropped. See question 2.
- Step index and loop collection per employee are runtime (`_` keys, not saved): after a load the employee starts its routine from the top.

## Open questions for Nicolas

1. Routines replace primary/backup jobs (recommended), or both exist side by side?
2. Old saves: (a) turn each employee's jobs into a routine with the same behaviour (recommended), (b) all employees start idle with the starter routines available, (c) keep old jobs as they are.
3. "Send to the market": listing in the showcase (customers buy) is what exists. Do you also want a new "sell single to the market" action (instant sale at a fraction of market value)?
4. Limits: up to 8 routines and 8 steps each. OK?
