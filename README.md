# Shadow Chess Demo

This version turns the prototype into a playable local web app:

- `node server.js` starts a dependency-free Node server
- Online rooms can be shared by link
- Setup is now fully manual: no auto shuffle on the player side
- A `Wraith` training screen explains how Shadow Chess differs from normal chess
- Castling is active again when the formation still allows it
- Each side keeps one `Fog Pulse` to hide every revealed non-king piece again

## Run

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

## Core Rules

- Every player arranges the 16 pieces inside their first two ranks before the match begins.
- The king is always visible.
- Other pieces stay hidden from the opponent until they move.
- Each player can trigger Fog Pulse once per match.
- Classical movement rules still apply, including castling when legal.

## Files

- `server.js`: room management and API
- `engine.js`: shared chess + shadow rules engine
- `shadow_chess.html`: main interface markup
- `app.js`: client-side flow and UI logic
- `styles.css`: visual design and layout
