# CCodePacMan

A rebuilt, mobile-first browser Pac-Man game built with vanilla HTML, CSS, and JavaScript.

## What changed

- Rebuilt the app from scratch for clearer mobile readability.
- Removed the overly dark/translucent UI that made the HUD and buttons hard to see.
- Added a responsive full-screen layout that fits the game, HUD, and controls inside the phone viewport.
- Reworked movement so direction buttons and swipes respond immediately on pointer-down.
- Added hold-to-steer controls, keyboard controls, pause/resume, restart, sound toggle, score, high score, levels, fruit, power pellets, and ghost behavior.

## Controls

| Action | Controls |
| --- | --- |
| Move | Arrow keys, WASD, touch buttons, or swipe on the maze |
| Start / Resume | Go button, Start button, Enter, or Space |
| Pause | Pause button, P, or Escape |
| Restart | Restart button |

## Gameplay

- Eat all pellets to clear the level.
- Power pellets make ghosts vulnerable.
- Eat frightened ghosts for combo points.
- Bonus fruit appears during the level.
- High score is saved locally in the browser.

## Files

```text
index.html   App shell and HUD
style.css    Mobile-first arcade styling
game.js      Game engine, controls, drawing, and AI
```
