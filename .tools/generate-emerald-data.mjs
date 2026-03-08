import fs from 'node:fs';
import path from 'node:path';

const BASE = path.resolve('.tools/emerald-data');
const OUT_DIR = path.resolve('backend/run');

const read = (name) => fs.readFileSync(path.join(BASE, name), 'utf8');

function fixText(s) {
  const repl = [
    ['POKéMON', 'Pokemon'],
    ['POKéMANIAC', 'Pokemaniac'],
    ['�', 'e'],
    ['♀', 'F'],
    ['♂', 'M'],
    ['–', '-'],
    ['“', '"'],
    ['�', '"'],
    ['{PKMN}', 'Pokemon'],
    ['PKMN', 'Pokemon'],
  ];
  let out = s;
  for (const [a, b] of repl) out = out.split(a).join(b);
  out = out.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

function titleToken(s) {
  s = fixText(s);
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      if (/^[A-Z0-9]{1,3}$/.test(w) && /\d/.test(w)) return w;
      if (/^[A-Z]{1,3}$/.test(w) && w === 'HP') return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function parseDefineInts(text) {
  const m = new Map();
  const re = /^#define\s+([A-Z0-9_]+)\s+([0-9]+)\s*$/gm;
  let hit;
  while ((hit = re.exec(text))) m.set(hit[1], Number(hit[2]));
  return m;
}

function parseIndexedNames(text) {
  const m = new Map();
  const re = /\[([A-Z0-9_]+)\]\s*=\s*_\("([^"]*)"\)/g;
  let hit;
  while ((hit = re.exec(text))) m.set(hit[1], titleToken(hit[2]));
  return m;
}

const speciesIds = parseDefineInts(read('species.h'));
const moveIds = parseDefineInts(read('moves.h'));
const speciesNames = parseIndexedNames(read('species_names.h'));
const moveNames = parseIndexedNames(read('move_names.h'));
const trainerClassNames = parseIndexedNames(read('trainer_class_names.h'));
const abilityNames = parseIndexedNames(read('ability_text.h'));

const TYPE_NAME = {
  TYPE_NORMAL: 'Normal', TYPE_FIGHTING: 'Fighting', TYPE_FLYING: 'Flying', TYPE_POISON: 'Poison', TYPE_GROUND: 'Ground', TYPE_ROCK: 'Rock', TYPE_BUG: 'Bug', TYPE_GHOST: 'Ghost', TYPE_STEEL: 'Steel',
  TYPE_FIRE: 'Fire', TYPE_WATER: 'Water', TYPE_GRASS: 'Grass', TYPE_ELECTRIC: 'Electric', TYPE_PSYCHIC: 'Psychic', TYPE_ICE: 'Ice', TYPE_DRAGON: 'Dragon', TYPE_DARK: 'Dark',
};
const PHYSICAL_TYPES = new Set(['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel']);

const speciesInfoText = read('species_info.h');
const speciesInfo = new Map();
{
  const re = /\[(SPECIES_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g;
  let hit;
  while ((hit = re.exec(speciesInfoText))) {
    const spc = hit[1];
    const body = hit[2];
    const gi = (field) => {
      const mm = new RegExp(`\\.${field}\\s*=\\s*([0-9]+)`).exec(body);
      return mm ? Number(mm[1]) : null;
    };
    const tm = /\.types\s*=\s*\{\s*(TYPE_[A-Z0-9_]+)\s*,\s*(TYPE_[A-Z0-9_]+)\s*\}/.exec(body);
    const am = /\.abilities\s*=\s*\{\s*(ABILITY_[A-Z0-9_]+)\s*,\s*(ABILITY_[A-Z0-9_]+)\s*\}/.exec(body);
    speciesInfo.set(spc, {
      hp: gi('baseHP') ?? 1,
      atk: gi('baseAttack') ?? 1,
      def: gi('baseDefense') ?? 1,
      spe: gi('baseSpeed') ?? 1,
      spa: gi('baseSpAttack') ?? 1,
      spd: gi('baseSpDefense') ?? 1,
      types: tm ? [tm[1], tm[2]] : ['TYPE_NORMAL', 'TYPE_NORMAL'],
      abilities: am ? [am[1], am[2]] : ['ABILITY_NONE', 'ABILITY_NONE'],
    });
  }
}

const battleMovesText = read('battle_moves.h');
const moveMeta = new Map();
{
  const re = /\[(MOVE_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g;
  let hit;
  while ((hit = re.exec(battleMovesText))) {
    const mv = hit[1];
    const body = hit[2];
    const pm = /\.power\s*=\s*([0-9]+)/.exec(body);
    const tm = /\.type\s*=\s*(TYPE_[A-Z0-9_]+)/.exec(body);
    const am = /\.accuracy\s*=\s*([0-9]+)/.exec(body);
    moveMeta.set(mv, {
      power: pm ? Number(pm[1]) : 0,
      type: tm ? (TYPE_NAME[tm[1]] ?? 'Normal') : 'Normal',
      accuracy: am ? Number(am[1]) : 0,
    });
  }
}

const ptrBySpecies = new Map();
{
  const re = /\[(SPECIES_[A-Z0-9_]+)\]\s*=\s*([A-Za-z0-9_]+)/g;
  let hit;
  const txt = read('level_up_learnset_pointers.h');
  while ((hit = re.exec(txt))) ptrBySpecies.set(hit[1], hit[2]);
}

const learnsetData = new Map();
{
  const re = /static const u16\s+([A-Za-z0-9_]+)\[\]\s*=\s*\{([\s\S]*?)\};/g;
  let hit;
  const txt = read('level_up_learnsets.h');
  while ((hit = re.exec(txt))) {
    const sym = hit[1];
    const body = hit[2];
    const pairs = [];
    const mr = /LEVEL_UP_MOVE\(\s*([0-9]+)\s*,\s*(MOVE_[A-Z0-9_]+)\s*\)/g;
    let mh;
    while ((mh = mr.exec(body))) pairs.push([Number(mh[1]), mh[2]]);
    learnsetData.set(sym, pairs);
  }
}

function defaultMovesForSpecies(speciesConst, level) {
  const ptr = ptrBySpecies.get(speciesConst);
  const pairs = learnsetData.get(ptr) ?? [];
  const known = [];
  for (const [lvl, mv] of pairs) {
    if (lvl > level) continue;
    if (mv === 'MOVE_NONE') continue;
    const idx = known.indexOf(mv);
    if (idx >= 0) known.splice(idx, 1);
    known.push(mv);
  }
  return known.slice(-4);
}

function ivToStatIv(ivRaw) {
  if (ivRaw <= 31) return ivRaw;
  return Math.max(0, Math.min(31, Math.round((ivRaw * 31) / 255)));
}

function calcStats(base, level, ivRaw) {
  const iv = ivToStatIv(ivRaw);
  const hp = Math.floor(((2 * base.hp + iv) * level) / 100) + level + 10;
  const stat = (v) => Math.floor(((2 * v + iv) * level) / 100) + 5;
  return { hp, atk: stat(base.atk), def: stat(base.def), spa: stat(base.spa), spd: stat(base.spd), spe: stat(base.spe) };
}

function displaySpecies(speciesConst) {
  const sid = speciesIds.get(speciesConst) ?? 0;
  const sname = speciesNames.get(speciesConst) ?? titleToken(speciesConst.replace(/^SPECIES_/, ''));
  return [sid, sname];
}

function displayMove(mvConst) {
  const meta = moveMeta.get(mvConst) ?? { power: 0, type: 'Normal', accuracy: 100 };
  const name = moveNames.get(mvConst) ?? titleToken(mvConst.replace(/^MOVE_/, ''));
  const category = meta.power <= 0 ? 'Status' : (PHYSICAL_TYPES.has(meta.type) ? 'Physical' : 'Special');
  return { name, power: meta.power, type: meta.type, category, accuracy: meta.accuracy === 0 ? null : meta.accuracy };
}

const parties = new Map();
{
  const txt = read('trainer_parties.h');
  const re = /static const struct\s+(\w+)\s+(\w+)\[\]\s*=\s*\{([\s\S]*?)\n\};/g;
  let hit;
  while ((hit = re.exec(txt))) {
    const structType = hit[1];
    const sym = hit[2];
    const body = hit[3];
    const mons = [];
    const mr = /\{([\s\S]*?)\},/g;
    let mh;
    while ((mh = mr.exec(body))) {
      const b = mh[1];
      const gf = (pattern) => {
        const mm = new RegExp(pattern).exec(b);
        return mm ? mm[1] : null;
      };
      const iv = Number(gf('\\.iv\\s*=\\s*([0-9]+)') ?? 0);
      const lvl = Number(gf('\\.lvl\\s*=\\s*([0-9]+)') ?? 1);
      const species = gf('\\.species\\s*=\\s*(SPECIES_[A-Z0-9_]+)') ?? 'SPECIES_NONE';
      const heldItem = gf('\\.heldItem\\s*=\\s*(ITEM_[A-Z0-9_]+)');
      const ability = gf('\\.ability\\s*=\\s*(ABILITY_[A-Z0-9_]+)');
      const nature = gf('\\.nature\\s*=\\s*(NATURE_[A-Z0-9_]+)');
      const moves = [];
      const mm = /\.moves\s*=\s*\{([^}]*)\}/s.exec(b);
      if (mm) {
        for (const x of mm[1].split(',').map((v) => v.trim())) {
          if (x.startsWith('MOVE_')) moves.push(x);
        }
      }
      mons.push({ iv, lvl, species, heldItem, ability, nature, moves });
    }
    parties.set(sym, { structType, mons });
  }
}

const trainers = [];
{
  const txt = read('trainers.h');
  const re = /\[(TRAINER_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g;
  let hit;
  while ((hit = re.exec(txt))) {
    const idConst = hit[1];
    if (idConst === 'TRAINER_NONE') continue;
    const body = hit[2];
    const cm = /\.trainerClass\s*=\s*(TRAINER_CLASS_[A-Z0-9_]+)/.exec(body);
    const nm = /\.trainerName\s*=\s*_\("([^"]*)"\)/.exec(body);
    const pm = /\.party\s*=\s*([A-Z_]+)\(([^)]+)\)/.exec(body);
    const dm = /\.doubleBattle\s*=\s*(TRUE|FALSE)/.exec(body);
    if (!cm || !nm || !pm) continue;
    trainers.push({
      idConst,
      trainerClass: cm[1],
      trainerName: titleToken(nm[1]),
      partySym: pm[2].trim(),
      double: dm ? dm[1] === 'TRUE' : false,
    });
  }
}

function normalizeClassName(c) {
  return trainerClassNames.get(c) ?? titleToken(c.replace(/^TRAINER_CLASS_/, ''));
}
function normalizeItem(ic) {
  if (!ic || ic === 'ITEM_NONE') return null;
  return titleToken(ic.replace(/^ITEM_/, ''));
}
function normalizeNature(nc) {
  if (!nc) return 'Hardy';
  return titleToken(nc.replace(/^NATURE_/, ''));
}
function normalizeAbility(ac, speciesConst) {
  if (ac && ac !== 'ABILITY_NONE') return abilityNames.get(ac) ?? titleToken(ac.replace(/^ABILITY_/, ''));
  const info = speciesInfo.get(speciesConst);
  if (!info) return null;
  const a = info.abilities[0];
  if (!a || a === 'ABILITY_NONE') return null;
  return abilityNames.get(a) ?? titleToken(a.replace(/^ABILITY_/, ''));
}

const VENUE_KEYWORDS = [
  ['AQUA_HIDEOUT', 'Team Aqua Hideout'],
  ['SEAFLOOR_CAVERN', 'Seafloor Cavern'],
  ['WEATHER_INST', 'Weather Institute'],
  ['RUSTURF_TUNNEL', 'Rusturf Tunnel'],
  ['PETALBURG_WOODS', 'Petalburg Woods'],
  ['MUSEUM', 'Oceanic Museum'],
  ['SPACE_CENTER', 'Mossdeep Space Center'],
  ['MT_PYRE', 'Mt. Pyre'],
  ['MT_CHIMNEY', 'Mt. Chimney'],
];
const LEADER_GYM = {
  ROXANNE: 'Rustboro Gym', BRAWLY: 'Dewford Gym', WATTSON: 'Mauville Gym', FLANNERY: 'Lavaridge Gym',
  NORMAN: 'Petalburg Gym', WINONA: 'Fortree Gym', TATE_AND_LIZA: 'Mossdeep Gym', JUAN: 'Sootopolis Gym',
};

function inferVenue(tid, tclass) {
  const rm = /ROUTE_([0-9]{3})/.exec(tid);
  if (rm) return `Route ${rm[1]}`;
  for (const [k, v] of VENUE_KEYWORDS) if (tid.includes(k)) return v;
  if (tclass === 'TRAINER_CLASS_ELITE_FOUR' || tclass === 'TRAINER_CLASS_CHAMPION') return 'Pokemon League';
  for (const [k, v] of Object.entries(LEADER_GYM)) if (tid.includes(k)) return v;
  if (tid.includes('STEVEN') && !tid.includes('CHAMPION')) return 'Meteor Falls';
  return null;
}

const fights = [];
const labelCount = new Map();

for (const t of trainers) {
  const party = parties.get(t.partySym);
  if (!party || !party.mons.length) continue;

  const clsName = normalizeClassName(t.trainerClass);
  const name = t.trainerName;

  let trainerDisp;
  if (name === 'Grunt' && (clsName.toUpperCase().includes('TEAM AQUA') || clsName.toUpperCase().includes('TEAM MAGMA'))) {
    trainerDisp = `${titleToken(clsName)} Grunt`;
  } else if (name) {
    trainerDisp = `${titleToken(clsName)} ${name}`.trim();
  } else {
    trainerDisp = titleToken(clsName);
  }

  const key = trainerDisp.toLowerCase();
  const idx = (labelCount.get(key) ?? 0) + 1;
  labelCount.set(key, idx);
  const label = idx === 1 ? trainerDisp : `${trainerDisp} (${idx})`;

  const opponentTeam = [];
  for (const mon of party.mons) {
    const [sid, sname] = displaySpecies(mon.species);
    if (sid <= 0) continue;

    const info = speciesInfo.get(mon.species) ?? { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1, types: ['TYPE_NORMAL', 'TYPE_NORMAL'], abilities: ['ABILITY_NONE', 'ABILITY_NONE'] };
    const level = Math.max(1, mon.lvl);
    const stats = calcStats(info, level, mon.iv);

    let rawMoves = mon.moves.filter((m) => m !== 'MOVE_NONE');
    if (!rawMoves.length) rawMoves = defaultMovesForSpecies(mon.species, level);
    if (!rawMoves.length) rawMoves = ['MOVE_TACKLE'];

    const moves = rawMoves.slice(0, 4).map(displayMove);

    const t1 = TYPE_NAME[info.types[0]] ?? 'Normal';
    const t2 = TYPE_NAME[info.types[1]] ?? t1;
    const types = t1 === t2 ? [t1] : [t1, t2];

    opponentTeam.push({
      species: sid,
      speciesName: sname,
      level,
      types,
      ability: normalizeAbility(mon.ability, mon.species),
      item: normalizeItem(mon.heldItem),
      nature: normalizeNature(mon.nature),
      stats,
      moves,
    });
  }

  if (!opponentTeam.length) continue;

  fights.push({
    id: t.idConst.replace(/^TRAINER_/, '').toLowerCase(),
    label,
    trainer: trainerDisp,
    venue: inferVenue(t.idConst, t.trainerClass),
    ruleset: t.double ? 'doubles' : 'singles',
    opponentTeam,
  });
}

const wild = JSON.parse(read('wild_encounters.json'));

function mapToArea(mapConst) {
  let raw = mapConst.replace(/^MAP_/, '');
  if (raw.startsWith('UNDERWATER_')) {
    const base = raw.replace(/^UNDERWATER_/, '');
    return `Underwater ${mapToArea(`MAP_${base}`)}`;
  }
  if (/^ROUTE\d+$/.test(raw)) return `Route ${raw.slice(5)}`;

  const words = raw.split('_');
  const out = words.map((w) => {
    if (w === 'MT') return 'Mt.';
    if (w === 'SS') return 'S.S.';
    if (/^[0-9]+F$/.test(w) || /^B[0-9]+F$/.test(w)) return w;
    if (/^[1-4]R$/.test(w)) return w;
    return titleToken(w);
  });
  return out.join(' ');
}

function slot(speciesConst, minLevel, maxLevel, rate) {
  const [sid, sname] = displaySpecies(speciesConst);
  return { species: sid, speciesName: sname, minLevel, maxLevel, rate: rate ?? null };
}

const encounterTables = new Map();
for (const group of wild.wild_encounter_groups ?? []) {
  const rateByType = new Map();
  let fishGroups = {};
  for (const f of group.fields ?? []) {
    rateByType.set(f.type, f.encounter_rates ?? []);
    if (f.type === 'fishing_mons') fishGroups = f.groups ?? {};
  }

  for (const enc of group.encounters ?? []) {
    const area = mapToArea(enc.map ?? '');
    if (!encounterTables.has(area)) encounterTables.set(area, []);
    const methods = [];

    if (enc.land_mons) {
      const rates = rateByType.get('land_mons') ?? [];
      methods.push({ method: 'Grass', slots: (enc.land_mons.mons ?? []).map((m, i) => slot(m.species, m.min_level, m.max_level, rates[i])) });
    }
    if (enc.water_mons) {
      const rates = rateByType.get('water_mons') ?? [];
      methods.push({ method: 'Surf', slots: (enc.water_mons.mons ?? []).map((m, i) => slot(m.species, m.min_level, m.max_level, rates[i])) });
    }
    if (enc.rock_smash_mons) {
      const rates = rateByType.get('rock_smash_mons') ?? [];
      methods.push({ method: 'Rock Smash', slots: (enc.rock_smash_mons.mons ?? []).map((m, i) => slot(m.species, m.min_level, m.max_level, rates[i])) });
    }
    if (enc.fishing_mons) {
      const rates = rateByType.get('fishing_mons') ?? [];
      const all = enc.fishing_mons.mons ?? [];
      const groups = [['old_rod', 'Old Rod'], ['good_rod', 'Good Rod'], ['super_rod', 'Super Rod']];
      for (const [key, label] of groups) {
        const idxs = fishGroups[key] ?? [];
        const s = [];
        for (const idx of idxs) {
          if (idx >= 0 && idx < all.length) {
            const m = all[idx];
            s.push(slot(m.species, m.min_level, m.max_level, rates[idx]));
          }
        }
        if (s.length) methods.push({ method: label, slots: s });
      }
    }

    const existing = encounterTables.get(area);
    const pos = new Map(existing.map((m, i) => [m.method, i]));
    for (const m of methods) {
      if (!m.slots.length) continue;
      if (pos.has(m.method)) existing[pos.get(m.method)].slots.push(...m.slots);
      else existing.push(m);
    }
  }
}

const routeSortKey = (area) => {
  const m = /^Route\s+(\d+)$/.exec(area);
  if (m) return [0, Number(m[1]), area];
  return [1, 0, area];
};

const sortedAreas = [...encounterTables.keys()].sort((a, b) => {
  const ka = routeSortKey(a);
  const kb = routeSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2]);
});

const encountersOut = {};
for (const a of sortedAreas) encountersOut[a] = encounterTables.get(a);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'encounters_emerald.json'), JSON.stringify(encountersOut, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'battles_emerald.json'), JSON.stringify({ fights }, null, 2));
fs.writeFileSync(path.resolve('.tools/emerald_areas.txt'), sortedAreas.map((a) => `"${a}"`).join(',\n        '));

console.log(`Generated encounters: ${sortedAreas.length} areas`);
console.log(`Generated battles: ${fights.length} fights`);
