# The Unicorn and the Foul Pattern

> The Pattern that was never meant to exist

This game is my second venture into the fantasy world of The Chronicles of Amber by Roger Zelazny. My first is the obscure entry from 2018 - Storm of the Chaos Bane.

The main protagonist here is the Unicorn - the primordial mother of Order. In the books, She appears only a handful of times, more like a mystic dream or a vision. Yet at the end of The Courts of Chaos, when Brand falls into the Abyss, taking the Jewel of Judgment with him, the Unicorn rises from the Abyss with the lost Jewel gleaming upon her horn..

Read more at [github](https://github.com/foumart/JS.13kGames.2026_TheFoulPattern).


## Campaign

Clear the Foul Pattern, divided into areas of 3 Vails each. Solve 3 puzzles to reach a Vail, then fight a turn-based tactical battle. In the final Vail, you face Brand himself.

## Arcade

Solve 100 puzzles of increasing difficulty.

### Puzzles

Guide the Unicorn, leaving a rainbow trail with every step. Surround enemies with the trail to capture them. You cannot cross your own trail - stepping onto it undoes your moves back to that point.

Each puzzle contains a Jewel. Collect it and reach the sparkling exit.

In Campaign, some stages contain imprisoned heroes that you must surround to rescue. Enemies left on the puzzle stages are carried in the upcoming Vail battle.

### Turn-based combat

The Unicorn moves like a chess knight. With the keyboard, use two arrow presses to aim the L-shaped jump: first choose the long leg, then the direction of the step.

Heroes and enemies have different attack / movement schemes, marked with chess abbreviations:

- **R** - Rook, horizontal / vertical
- **B** - Bishop, diagonal
- **K** - Knight, L-shaped

For example, **R2** means an attack or move with a range of two orthogonal tiles.


## Controls

Mouse / Touch: Click / Tap / Swipe to move select or attack

Keyboard: Arrows / WASD 

Space: attack enemies in range

Enter: end Unicorn's turn early

Tab / Shift+Tab: Cycle through player / enemy stats

Esc: Pause.

R: Restart

N: Debug build only - clears the current stage

## Install

```bash
npm install
```

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run debug` | Inline JS/CSS, no minification + BrowserSync live reload |
| `npm run build` | Minified build + BrowserSync live reload |
| `npm run prod` | Minify + Roadroller + zip - builds and tests the package size |
| `npm run release` | Minify + Roadroller + zip - creates the smallest package possible |
| `npm run raw` | Keep JS/CSS as separate files for easier debugging |
| `npm test` | Re-zip `public/` as `zip/game.zip` and report size |


