# Emerald / Platinum Nuzlocke Tool

A local tracker and battle-planning app for **Pokemon Emerald and Pokemon Platinum Nuzlocke runs**.

It reads your `.sav`/`.dsv` file with PKHeX, shows live party/box data, tracks encounter locks and deaths, and includes a battle simulator against a curated trainer catalog.

## What this repo contains

- `backend/`: ASP.NET Core API (`net10.0-windows`) that parses saves and serves run data
- `frontend/`: React + TypeScript + Vite UI
- `backend/run/encounters_emerald.json`: Emerald encounter tables used by the Encounters page
- `backend/run/encounters_platinum.json`: Platinum encounter tables used by the Encounters page
- `backend/run/battles_emerald.json`: Emerald trainer fights used by Battle Sim
- `backend/run/battles_platinum.json`: Platinum trainer fights used by Battle Sim

## Prerequisites

- **Windows** (backend targets `net10.0-windows` and uses Windows file picker APIs)
- **.NET 10 SDK**
- **Node.js** (recommended: current LTS) and npm

## Quick start

Open two terminals from the repo root.

### 1) Start backend

```powershell
cd backend
dotnet restore
dotnet run
```

Backend default URL (from launch settings):

- `http://localhost:5091`

### 2) Start frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open the Vite URL shown in terminal (usually `http://localhost:5173`).

The frontend proxies `/api/*` to `http://localhost:5091` via `frontend/vite.config.ts`.

## How to use

1. Start backend and frontend.
2. In the app header, either:
   - Paste a save path and click **Load Save**, or
   - Click **Browse...** to pick a `.sav`/`.dsv` file.
3. The backend auto-detects the loaded save's game mode (`emerald` or `platinum`) and switches encounter/battle catalogs automatically.
4. Use tabs:
   - **Dashboard**: live party/box view, Pokemon details, IVs/stats/moves, mark encounter status alive/dead
   - **Encounters**: lock/unlock encounters by area, see encounter tables by time of day, auto-import locks from loaded save
     - Encounter slots are merged by species in the UI (for example `Poochyena Lv 2-3` instead of duplicate cards)
     - Encounter sprite IDs are normalized from species names so sprites match the displayed Pokemon
     - Encounter lock state is scoped per game mode to prevent Emerald/Platinum cross-contamination
  - **Battle Sim**: select area/fight and compare damage ranges between your party and opponent teams
    - Emerald defaults to **Main story only** fights (toggleable in Battle Sim)
    - Opponent sprites are resolved by species name to avoid bad legacy species IDs in catalog data
5. Keep playing/saving in emulator; backend watches file changes and pushes updates to UI (SSE).

## Data and cache files generated at runtime

Backend writes these in its output folder:

- `runstate.json`: your encounter lock/status state
  - Includes game-scoped encounter sections so Emerald and Platinum runs stay isolated
- `namecache.json`: cached Pokemon/item/move/type names
- `movecache.json`: cached move metadata
- `uploaded-saves/`: uploaded save copies when using `/api/upload-save`

## Useful API endpoints

- `GET /api/state`
- `POST /api/watch` with `{ "path": "C:\\path\\to\\file.sav" }`
- `GET /api/encounters`
- `POST /api/encounters/lock`
- `POST /api/encounters/unlock`
- `POST /api/encounters/status`
- `GET /api/encounters/table/{area}?timeOfDay=day`
  - Returns encounter slots with normalized national dex IDs (resolved from species names when needed)
- `GET /api/battles`
  - Loads `run/battles_{mode}.json` (`emerald` or `platinum`) based on current save mode
- `GET /api/moves/meta?ids=15,33,85`

## Notes

- First run may call PokeAPI to resolve names/types/moves; results are cached locally.
- `backend/run/battles_emerald.json` is curated for Nuzlocke planning (non-story rematches removed, story/admin/rival/gym/e4/champion fights retained).
- Some battle move entries use `accuracy: null`; backend supports this.
- If you change backend port, update frontend proxy target in `frontend/vite.config.ts`.

## Sources

- `PokeAPI` (runtime species/type/move/item/nature lookups): https://pokeapi.co/
- `PokeAPI sprite repository` (Gen 3/4/5 and default sprites used by UI): https://raw.githubusercontent.com/PokeAPI/sprites/master/
- `Pokemon Showdown sprite CDN` (XY animated sprites used by dashboard): https://play.pokemonshowdown.com/sprites/xyani/
- `PKHeX.Core` (save parsing library): https://github.com/kwsch/PKHeX and https://www.nuget.org/packages/PKHeX.Core
- `NuGet registry` (backend package source): https://api.nuget.org/v3/index.json
- `npm registry` (frontend package source): https://registry.npmjs.org/
- `Serebii - Emerald Gym leaders` (Emerald gym team validation): https://www.serebii.net/emerald/gym.shtml
- `Serebii - Emerald Elite Four/Champion` (E4 and champion team validation): https://www.serebii.net/emerald/elite.shtml
- `Serebii Pokearth - Route 110 (Gen 3)` (rival fight team validation): https://www.serebii.net/pokearth/hoenn/3rd/route110.shtml
- `Serebii Pokearth - Route 119 (Gen 3)` (rival fight team validation): https://www.serebii.net/pokearth/hoenn/3rd/route119.shtml
- `Serebii Pokearth - Lilycove City (Gen 3)` (rival fight team validation): https://www.serebii.net/pokearth/hoenn/3rd/lilycovecity.shtml
- `Serebii Match Call` (rival/Wally location cross-checks): https://www.serebii.net/emerald/entrycall/
- `Bulbapedia` (story battle/location cross-checks): https://bulbapedia.bulbagarden.net/
