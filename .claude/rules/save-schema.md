# Save schema

Saves are versioned JSON. A player's save must never break.

## Format

`{ game, saveVersion, gameVersion, exportedAt, state }`

- `saveVersion` is an integer. Each schema change adds one migration `vN → vN+1`; migrations run in order on load and on import.
- After migrations, `state` is merged with defaults: missing fields get the default, unknown fields are ignored.
- Card or collection ids that no longer exist are skipped without touching the rest.
- Device preferences (theme, volumes) live in a separate localStorage key, never in the save.
- Market prices are never saved; they are computed from the day (`.claude/rules/design-pillars.md`).

## Where

`js/save.js`: `SAVE_VERSION`, `MIGRATIONS`, `mergeDefaults`, `sanitize`. Defaults come from `newState()` in `js/game.js`. State keys starting with `_` are runtime caches and are never saved.

## Ask before changing

**Any change that adds, removes, renames or changes the meaning of a field in `state` needs Nicolas's decision before it is implemented.** Ask him, in Portuguese, for each affected field: "o que acontece com esse campo em saves antigos?" and offer concrete options (default value, derive from other fields, drop it). Do not pick for him.

Use the `change-save-schema` skill for the full process.

## Never

- Change a collection `id` or card `id` once published.
- Reuse a removed field name with a different meaning.
- Edit an existing migration after it has shipped; add a new one instead.
