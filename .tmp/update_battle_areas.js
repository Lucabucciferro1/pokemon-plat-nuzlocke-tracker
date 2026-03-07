const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const battlesPath = path.join(repoRoot, 'backend', 'run', 'battles_platinum.json');
const pokeRoot = path.join(repoRoot, '.tmp', 'pokeplatinum');
const eventsDir = path.join(pokeRoot, 'res', 'field', 'events');
const scriptsDir = path.join(pokeRoot, 'res', 'field', 'scripts');

function titleWord(w) {
  if (!w) return w;
  const low = w.toLowerCase();
  if (/^\d+$/.test(low)) return low;
  if (low === 'mt') return 'Mt.';
  if (low === 'pokemon') return 'Pokemon';
  if (low === 'tv') return 'TV';
  if (/^[a-z]\d+$/i.test(low)) return low.toUpperCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function areaFromStem(stem) {
  const parts = stem.split('_').filter(Boolean);
  if (!parts.length) return 'Unknown Area';

  if (parts[0] === 'route' && parts[1]) {
    return `Route ${parts[1]}`;
  }

  if (parts[0] === 'seabreak' && parts[1] === 'path') {
    return 'Seabreak Path';
  }

  const words = parts.map(titleWord);
  let out = words.join(' ');
  out = out
    .replace(/\bN\b/g, 'N')
    .replace(/\bS\b/g, 'S')
    .replace(/\bE\b/g, 'E')
    .replace(/\bW\b/g, 'W')
    .replace(/\bRm\b/g, 'Room')
    .replace(/\bPkmn\b/g, 'Pokemon');
  return out;
}

function inferFromFight(fight) {
  if (fight.venue && String(fight.venue).trim()) return String(fight.venue).trim();
  const id = String(fight.id || '').toLowerCase();

  const route = id.match(/route_(\d{3})/);
  if (route) return `Route ${route[1]}`;

  const map = [
    ['oreburgh', 'Oreburgh City'],
    ['eterna', 'Eterna City'],
    ['hearthome', 'Hearthome City'],
    ['veilstone', 'Veilstone City'],
    ['pastoria', 'Pastoria City'],
    ['canalave', 'Canalave City'],
    ['snowpoint', 'Snowpoint City'],
    ['sunyshore', 'Sunyshore City'],
    ['pokemon_league', 'Pokemon League'],
    ['spear_pillar', 'Spear Pillar'],
    ['fight_area', 'Fight Area'],
    ['survival_area', 'Survival Area'],
    ['resort_area', 'Resort Area'],
    ['battle_zone', 'Battle Zone'],
  ];

  for (const [needle, label] of map) {
    if (id.includes(needle)) return label;
  }

  return areaFromStem(id);
}

function addArea(map, trainerConst, area) {
  if (!trainerConst || !area) return;
  if (!map.has(trainerConst)) map.set(trainerConst, new Set());
  map.get(trainerConst).add(area);
}

function pickBestArea(areaSet) {
  const areas = Array.from(areaSet || []);
  if (!areas.length) return null;
  const bad = ['Battleground', 'Battle Tower', 'Battle Factory', 'Battle Hall', 'Battle Castle', 'Battle Arcade'];
  const filtered = areas.filter((a) => !bad.some((b) => a.includes(b)));
  const pool = filtered.length ? filtered : areas;

  pool.sort((a, b) => {
    const aScore = /Route|City|Town|Gym|League|Cave|Mt\.|Mountain|Road|Area|Lake|Pillar|Gate|Island|Ruin|Valley/i.test(a) ? 0 : 1;
    const bScore = /Route|City|Town|Gym|League|Cave|Mt\.|Mountain|Road|Area|Lake|Pillar|Gate|Island|Ruin|Valley/i.test(b) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });

  return pool[0];
}

const trainerAreas = new Map();

if (fs.existsSync(eventsDir)) {
  for (const file of fs.readdirSync(eventsDir)) {
    if (!file.startsWith('events_') || !file.endsWith('.json')) continue;
    const stem = file.slice('events_'.length, -'.json'.length);
    const area = areaFromStem(stem);
    const full = path.join(eventsDir, file);

    try {
      const json = JSON.parse(fs.readFileSync(full, 'utf8'));
      const objEvents = Array.isArray(json.object_events) ? json.object_events : [];
      for (const ev of objEvents) {
        const script = ev && typeof ev.script === 'string' ? ev.script : null;
        if (!script || !script.startsWith('TRAINER_')) continue;
        addArea(trainerAreas, script, area);
      }
    } catch {
      // ignore malformed files
    }
  }
}

if (fs.existsSync(scriptsDir)) {
  for (const file of fs.readdirSync(scriptsDir)) {
    if (!file.startsWith('scripts_') || !file.endsWith('.s')) continue;
    const stem = file.slice('scripts_'.length, -'.s'.length);
    const area = areaFromStem(stem);
    const text = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
    const lines = text.split(/\r?\n/);

    for (const raw of lines) {
      const line = raw.split('//')[0];
      if (!line) continue;
      const m = line.match(/\bStart\w*Battle\s+(TRAINER_[A-Z0-9_]+)/);
      if (m) addArea(trainerAreas, m[1], area);
    }
  }
}

const battles = JSON.parse(fs.readFileSync(battlesPath, 'utf8'));
const fights = Array.isArray(battles.fights) ? battles.fights : [];

const filtered = fights.filter((f) => !String(f.id || '').toLowerCase().includes('rematch'));

for (const fight of filtered) {
  const trainerConst = `TRAINER_${String(fight.id || '').toUpperCase()}`;
  const mapped = pickBestArea(trainerAreas.get(trainerConst));
  fight.venue = mapped || inferFromFight(fight);
}

battles.fights = filtered;
fs.writeFileSync(battlesPath, JSON.stringify(battles, null, 2) + '\n', 'utf8');

const missing = battles.fights.filter((f) => !f.venue || !String(f.venue).trim()).length;
console.log(`Updated fights=${battles.fights.length} missingVenue=${missing}`);
