# CCodePacMan

A browser-based Pac-Man clone built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step — just open `index.html` in a browser and play.

![Pac-Man](https://img.shields.io/badge/Pac-Man-yellow) ![JavaScript](https://img.shields.io/badge/JS-vanilla-f7df1e)

## Play

1. Clone or download this repo
2. Open `index.html` directly in your browser

Or serve the folder over HTTP if you prefer:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Action      | Keys                       |
| ----------- | -------------------------- |
| Move up     | `Arrow Up` or `W`          |
| Move down   | `Arrow Down` or `S`        |
| Move left   | `Arrow Left` or `A`        |
| Move right  | `Arrow Right` or `D`       |
| Start / Go  | `Enter` or `Space`         |

## Gameplay

- Eat all pellets in the maze to clear the level.
- The four ghosts each have their own personality:
  - **Blinky** (red) chases Pac-Man directly.
  - **Pinky** (pink) tries to ambush four tiles ahead.
  - **Inky** (cyan) flanks based on Blinky's position.
  - **Clyde** (orange) chases when far, scatters when close.
- Eat a **power pellet** (the four big dots in the corners) to make ghosts vulnerable for a few seconds. Eaten ghosts retreat to the ghost house.
- Score: pellet `10`, power pellet `50`, ghost combo `200 / 400 / 800 / 1600`.
- 3 lives. Game over when you run out.
- High score is saved to `localStorage`.

## File layout

```
index.html   page + HUD overlay
style.css    arcade styling
game.js      entire game (maze, entities, AI, render loop)
```

## License

MIT
