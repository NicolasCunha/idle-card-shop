---
name: change-save-schema
description: Change the IdleCardShop save format safely — get Nicolas's decision on old saves, bump saveVersion, write the migration, test with old saves. Use whenever a change adds, removes, renames or changes the meaning of a saved field.
---

# Change the save schema

Rules: `.claude/rules/save-schema.md`.

## 1. List the change

For each affected field in `state`: name, old shape, new shape, and why.

## 2. Ask Nicolas (required)

Before writing code, ask in Portuguese, per field: "o que acontece com esse campo em saves antigos?" Offer concrete options, for example:

- use a default value (say which);
- derive it from other saved data (say how);
- drop the old data (say what the player loses).

Wait for his answer. Do not choose for him, even if one option looks obvious.

## 3. Implement

1. Bump `saveVersion` by 1.
2. Add migration `vN → vN+1` implementing his decision. Never edit a shipped migration.
3. Update the defaults so the merge step fills new fields.
4. Keep import working: imported files run the same migration chain.

**[PENDING tech stack]** Location of migrations and defaults.

## 4. Test

- A fixture save for every previous `saveVersion` loads, migrates and plays.
- Export → import round-trip gives the same state.
- Unknown fields and missing collections/cards are ignored without loss elsewhere.
- Add the new version's fixture for future tests.

## 5. Record

Note the change and Nicolas's decision in the save SDD (`docs/sdd/`), with the date.
