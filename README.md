# Platinum Nuzlocke Tool

A local tracker and battle-planning app for **Pokemon Platinum Nuzlocke runs**.

It reads your `.sav`/`.dsv` file with PKHeX, shows live party/box data, tracks encounter locks and deaths, and includes a battle simulator against a curated trainer catalog.

## What this repo contains

- `backend/`: ASP.NET Core API (`net10.0-windows`) that parses saves and serves run data
- `frontend/`: React + TypeScript + Vite UI
- `backend/run/encounters_platinum.json`: encounter tables used by the Encounters page
- `backend/run/battles_platinum.json`: trainer fights used by Battle Sim

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
3. Use tabs:
   - **Dashboard**: live party/box view, Pokemon details, IVs/stats/moves, mark encounter status alive/dead
   - **Encounters**: lock/unlock encounters by area, see encounter tables by time of day, auto-import locks from loaded save
   - **Battle Sim**: select area/fight and compare damage ranges between your party and opponent teams
4. Keep playing/saving in emulator; backend watches file changes and pushes updates to UI (SSE).

## Data and cache files generated at runtime

Backend writes these in its output folder:

- `runstate.json`: your encounter lock/status state
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
- `GET /api/encounters/table/{area}?timeOfDay=morning|day|night`
- `GET /api/battles`
- `GET /api/moves/meta?ids=15,33,85`

## Notes

- First run may call PokeAPI to resolve names/types/moves; results are cached locally.
- If you change backend port, update frontend proxy target in `frontend/vite.config.ts`.
