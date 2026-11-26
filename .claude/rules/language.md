# Language

- Everything the player sees is in English: UI labels, tooltips, tutorial steps, market news, card names, offline summary, error messages.
- Code, identifiers, comments, commit messages, SDDs, rules and skills are in English.
- The GDD (`docs/GDD.md`) stays in Portuguese for the owner. **[PENDING GDD Q7]** — confirm this split.
- Talk to Nicolas in Portuguese.
- No localization layer in v1. Keep player-facing strings in data files or a single strings module, not scattered literals, so a later translation is possible without a rewrite.
