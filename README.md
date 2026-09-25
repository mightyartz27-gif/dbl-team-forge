# DBL Team Forge

Mobile-first Dragon Ball Legends team builder. Pick one to three characters and get complete, ranked teams: the other fighters, the best 3 bench members, the Leader, Zenkai support and equipment — with every number explained.

Unofficial fan project. Not affiliated with Bandai Namco. Character and equipment data comes from the [dblegends.net](https://dblegends.net) community database.

## What it does

- **Build around characters** — lock 1–3 fighters; the optimizer searches every other slot. Locked characters are never replaced.
- **Seven team variants per search** — your priority plus Balanced, Z Ability, Zenkai, Health, offense (Strike/Blast/Damage from the locked unit's profile) and Tag synergy, de-duplicated.
- **Bench is its own search** — bench members are ranked only by buffs that actually reach the three fighters (Leader privilege included), never by total Ability Bonus. Ranked alternatives with "why not #1".
- **Leader testing** — every fighter is tried as Leader and compared.
- **Equipment optimizer** — 3 pieces per fighter, compatibility enforced, trio conditions evaluated live, OR-rolls and your actual roll values supported.
- **Improve this team** — problems detected (low coverage, wasted Z Abilities, inactive Zenkai or equipment conditions) and single swaps ranked by score gain.
- **What-if** — change anything and see before / after / difference instantly.
- **Compare** — side-by-side table of all generated teams.
- **Rating Match (PvP) mode** — the official tier list (Featured, Z, S, A, B, C) is imported automatically every day; tier bonuses are added to fighters' stats, fighters can be limited to chosen tiers (default Featured–B) and rarities, and teams can be suggested with no locked character.
- **My box** — mark owned characters (or paste card codes) and generate from your box only.
- **Transparency** — the score is a configurable internal metric with its breakdown shown; effects that can't be quantified are listed as *Not calculated*, never guessed.

## Architecture

```
dblegends.net ──► scripts/ingest/fetch.mjs      raw cache (.cache/raw)
                  scripts/ingest/normalize.mjs  parse text → structured effects, validation report
                          │
                          ├─► src/data/generated/*.json  (bundled snapshot, versioned in git)
                          └─► scripts/ingest/supabase-sync.mjs ─► Supabase (optional)
                                                   │
src/data/source.ts  loads the bundled snapshot, switches to Supabase if it holds a newer version
src/engine/         pure TypeScript, no React
  zAbilities.ts     team model, conditions, Z / Zenkai / Assault propagation, Leader privilege
  equipment.ts      compatibility, 7 condition types, per-member and same-equipment scaling
  stats.ts          base / pure / direct layers per source
  weights.ts        every optimization weight (configurable)
  scoring.ts        10-component score, wasted buffs, uncalculated effects
  equipOptimizer.ts greedy layered equipment selection
  generator.ts      candidate filtering → trio × Leader enumeration → exact bench → full evaluation
  analysis.ts       bench ranking, Leader comparison, diagnostics, swaps, explanations
  worker.ts         runs the generator off the main thread (main-thread fallback in runner.ts)
src/components, src/pages   mobile-first React UI (Tailwind v4)
```

The UI never touches raw data; new characters and equipment arrive through ingestion only.

## Hosting with GitHub only (no installs)

1. Upload these files to a public GitHub repository.
2. Settings → Pages → Source: **GitHub Actions**.
3. `.github/workflows/deploy-pages.yml` builds, tests and publishes to `https://<you>.github.io/<repo>/` on every change.
4. `.github/workflows/refresh-data.yml` refreshes the game data twice a week and `refresh-tiers.yml` checks the PvP tier list daily; both trigger a redeploy.

Supabase and Netlify are optional (see below).

## Run locally

```bash
npm install
npm run dev          # uses the bundled snapshot
npm test             # engine tests against the real database
npm run ingest       # refresh data from dblegends.net (cached, polite: 3 parallel requests, 250 ms delay)
```

## Hosting on GitHub Pages (only GitHub needed)

1. Push this repo to GitHub (Pages is free for public repositories).
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write**.
4. Every push to `main` runs `.github/workflows/deploy-pages.yml` (tests → build → publish).
   The site appears at `https://<username>.github.io/<repo>/`.

The app runs entirely from the data snapshot built into the site. The user's box and current team are saved in their browser.

## Keeping data current

`.github/workflows/refresh-data.yml` runs every Monday and Thursday (and on demand from the Actions tab): fetch from dblegends.net → normalize → tests → commit the new snapshot. The Pages deploy runs automatically after it. The job summary lists new characters, new equipment and any ability text the parser couldn't read.

## Optional: Supabase

Not required. If you later want accounts or a shared database: run `supabase/migrations/20260925000000_init.sql` in a Supabase project, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repository secrets (the refresh job then syncs automatically), and build with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Accuracy

See [docs/METHODOLOGY.md](docs/METHODOLOGY.md) for the exact rules, their sources and the assumptions still to verify in game.
