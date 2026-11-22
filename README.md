# The Velvet Vault

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/SachinBairagi/best-heist-game-20261122-0559/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/SachinBairagi/best-heist-game-20261122-0559/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

The Velvet Vault is a top-down stealth heist game. One thief, one museum
gallery, one Star Sapphire on its vault pedestal. Cross the room, dodge
three patrolling guards with vision cones and three sweeping wall cameras,
pocket four loot items, crack the vault, and slip out the front door
before the alarm meter fills.

## How to play

- Move with WASD or the arrow keys. Hold Shift to sneak.
- Hold E beside the vault pedestal to crack the Star Sapphire.
- Click to throw a coin and lure a guard away to investigate.
- Being spotted fills the alarm meter. At 100% the guards give chase.
- Grab the sapphire and reach the front door to win.

All art is drawn in code and all sounds are synthesized in the browser.
No network requests, no external assets.

## Run it

```sh
node main.ts
```

That copies `game/` and `screenshots/` into the output directory and
writes `dossier.json`. To play, open `game/index.html` in desktop Chrome.

## Files

- `game/index.html` - page structure for the museum gallery
- `game/game.js` - guards, cameras, loot, alarm and all play logic
- `main.ts` - entry program, copies game/ and screenshots/ and writes dossier.json
- `vendor/makefun-game.ts` - make.fun dossier library, copied unchanged from the kit
- `screenshots/` - real renders of the game running in a desktop browser

---

<sub>Entered on [make.fun](https://make.fun/?ref=makefun-lunar-basket-brook&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
