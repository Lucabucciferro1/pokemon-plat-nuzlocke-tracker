const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, '.tmp', 'pokeplatinum');
const trainersDir = path.join(srcRoot, 'res', 'trainers', 'data');
const pokemonDir = path.join(srcRoot, 'res', 'pokemon');
const movesDir = path.join(srcRoot, 'res', 'battle', 'moves');

const outPath = path.join(repoRoot, 'backend', 'run', 'battles_platinum.json');

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function titleizeToken(token) {
  return token
    .replace(/^(SPECIES_|MOVE_|ITEM_|ABILITY_|TYPE_|TRAINER_CLASS_)/, '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => {
      if (part === 'hp') return 'HP';
      if (part === 'pp') return 'PP';
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\bMr\b/g, 'Mr.')
    .replace(/\bJr\b/g, 'Jr.')
    .replace(/\bU Turn\b/g, 'U-turn')
    .replace(/\bX Scissor\b/g, 'X-Scissor')
    .replace(/\bWill O Wisp\b/g, 'Will-O-Wisp')
    .replace(/\bFaint Attack\b/g, 'Faint Attack');
}

function normalizeSlugFromToken(token, prefix) {
  return token.startsWith(prefix) ? token.slice(prefix.length).toLowerCase() : token.toLowerCase();
}

function toCategory(value) {
  if (value === 'CLASS_PHYSICAL') return 'Physical';
  if (value === 'CLASS_SPECIAL') return 'Special';
  return 'Status';
}

function toType(value) {
  return titleizeToken(value || 'TYPE_NORMAL');
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pathExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

const speciesEnum = readLines(path.join(srcRoot, 'generated', 'species.txt'));
const movesEnum = readLines(path.join(srcRoot, 'generated', 'moves.txt'));

const speciesIdByToken = new Map();
speciesEnum.forEach((token, idx) => speciesIdByToken.set(token, idx));

const moveMetaByToken = new Map();
for (const moveToken of movesEnum) {
  const slug = normalizeSlugFromToken(moveToken, 'MOVE_');
  const movePath = path.join(movesDir, slug, 'data.json');
  if (!pathExists(movePath)) continue;
  const data = loadJson(movePath);
  moveMetaByToken.set(moveToken, {
    name: data.name || titleizeToken(moveToken),
    power: Number.isFinite(data.power) ? data.power : 0,
    type: toType(data.type),
    category: toCategory(data.class),
    accuracy: Number.isFinite(data.accuracy) ? (data.accuracy === 0 ? 100 : data.accuracy) : 100,
  });
}

const pokemonDataByToken = new Map();
for (const speciesToken of speciesEnum) {
  if (speciesToken === 'SPECIES_NONE') continue;
  const slug = normalizeSlugFromToken(speciesToken, 'SPECIES_');
  const pPath = path.join(pokemonDir, slug, 'data.json');
  if (!pathExists(pPath)) continue;
  const data = loadJson(pPath);
  const base = data.base_stats || {};
  const abilities = Array.isArray(data.abilities) ? data.abilities : [];
  const types = Array.isArray(data.types) ? data.types : [];
  const learnset = data.learnset && Array.isArray(data.learnset.by_level) ? data.learnset.by_level : [];
  const speciesId = speciesIdByToken.get(speciesToken) || 0;
  const rawName = data.pokedex_data?.en?.name || speciesToken;

  pokemonDataByToken.set(speciesToken, {
    id: speciesId,
    name: titleizeToken(rawName),
    baseStats: {
      hp: base.hp || 1,
      atk: base.attack || 1,
      def: base.defense || 1,
      spa: base.special_attack || 1,
      spd: base.special_defense || 1,
      spe: base.speed || 1,
    },
    types: Array.from(new Set(types.map((t) => toType(t)).filter(Boolean))),
    abilities: abilities.filter((a) => a && a !== 'ABILITY_NONE').map((a) => titleizeToken(a)),
    learnsetByLevel: learnset
      .map((x) => ({ level: Number(x[0]) || 1, move: x[1] }))
      .filter((x) => typeof x.move === 'string'),
  });
}

function calcStat(base, level, iv, isHp) {
  const core = Math.floor(((2 * base + iv) * level) / 100);
  return isHp ? core + level + 10 : core + 5;
}

function getDefaultMoves(speciesToken, level) {
  const p = pokemonDataByToken.get(speciesToken);
  if (!p) return [];
  const learned = [];
  for (const entry of p.learnsetByLevel) {
    if (entry.level <= level) learned.push(entry.move);
  }
  return learned.slice(-4);
}

function buildMove(moveToken) {
  if (!moveToken || moveToken === 'MOVE_NONE') return null;
  const meta = moveMetaByToken.get(moveToken);
  if (meta) return { ...meta };
  return { name: titleizeToken(moveToken), power: 0, type: 'Normal', category: 'Status', accuracy: 100 };
}

function labelFromStem(stem) {
  return stem.split('_').map((p) => (/^\d+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

function trainerLabel(trClass, trainerName) {
  const classLabel = titleizeToken(trClass || 'TRAINER_CLASS_TRAINER');
  const tName = (trainerName || '').trim();
  if (!tName) return classLabel;
  const classWords = classLabel.toLowerCase();
  const nameWords = tName.toLowerCase();
  if (classWords.endsWith(nameWords) || classWords.includes(` ${nameWords}`)) {
    return classLabel;
  }
  return `${classLabel} ${tName}`;
}

function toTitleWords(parts) {
  return parts.map((p) => (/^\d+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

function venueFromStem(stem) {
  const gymMap = {
    leader_roark: 'Oreburgh Gym',
    leader_gardenia: 'Eterna Gym',
    leader_fantina: 'Hearthome Gym',
    leader_maylene: 'Veilstone Gym',
    leader_wake: 'Pastoria Gym',
    leader_byron: 'Canalave Gym',
    leader_candice: 'Snowpoint Gym',
    leader_volkner: 'Sunyshore Gym',
  };
  for (const key of Object.keys(gymMap)) {
    if (stem.startsWith(key)) return gymMap[key];
  }

  if (stem.startsWith('elite_four_') || stem.startsWith('champion_cynthia')) return 'Pokemon League';

  if (stem.startsWith('rival_route_')) {
    const m = stem.match(/^rival_route_(\d{3})/);
    if (m) return `Route ${m[1]}`;
  }

  if (stem.startsWith('rival_')) {
    const parts = stem.split('_').slice(1);
    while (parts.length && ['chimchar', 'piplup', 'turtwig', 'unused', '1', '2'].includes(parts[parts.length - 1])) {
      parts.pop();
    }
    if (parts.length) return toTitleWords(parts);
  }

  return null;
}

const trainerFiles = fs.readdirSync(trainersDir).filter((f) => f.endsWith('.json')).sort();
const fights = [];

for (const file of trainerFiles) {
  const stem = file.slice(0, -5);
  const data = loadJson(path.join(trainersDir, file));
  const party = Array.isArray(data.party) ? data.party : [];
  if (!party.length) continue;

  const opponentTeam = [];

  for (const mon of party) {
    const speciesToken = mon.species;
    if (!speciesToken || speciesToken === 'SPECIES_NONE') continue;

    const speciesData = pokemonDataByToken.get(speciesToken);
    const speciesId = speciesIdByToken.get(speciesToken) || 0;
    const level = Number(mon.level) || 1;

    const ivScale = Number(mon.iv_scale) || 0;
    const iv = Math.floor((ivScale * 31) / 255);

    const baseStats = speciesData ? speciesData.baseStats : { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
    const stats = {
      hp: calcStat(baseStats.hp, level, iv, true),
      atk: calcStat(baseStats.atk, level, iv, false),
      def: calcStat(baseStats.def, level, iv, false),
      spa: calcStat(baseStats.spa, level, iv, false),
      spd: calcStat(baseStats.spd, level, iv, false),
      spe: calcStat(baseStats.spe, level, iv, false),
    };

    const explicitMoves = Array.isArray(mon.moves)
      ? mon.moves.filter((m) => typeof m === 'string' && m !== 'MOVE_NONE')
      : [];
    const defaults = getDefaultMoves(speciesToken, level);
    const finalMoveTokens = [...explicitMoves];

    for (const mv of defaults) {
      if (finalMoveTokens.length >= 4) break;
      if (!finalMoveTokens.includes(mv)) finalMoveTokens.push(mv);
    }
    while (finalMoveTokens.length < 4) finalMoveTokens.push('MOVE_NONE');

    const moves = finalMoveTokens.map((mv) => buildMove(mv)).filter(Boolean);

    const heldItem = mon.item && mon.item !== 'ITEM_NONE' ? titleizeToken(mon.item) : null;

    opponentTeam.push({
      species: speciesId,
      speciesName: speciesData ? speciesData.name : titleizeToken(speciesToken),
      level,
      types: speciesData ? speciesData.types : ['Normal'],
      ability: speciesData && speciesData.abilities.length ? speciesData.abilities[0] : null,
      item: heldItem,
      nature: 'Hardy',
      stats,
      moves,
    });
  }

  if (!opponentTeam.length) continue;

  const fight = {
    id: stem,
    label: labelFromStem(stem),
    trainer: trainerLabel(data.class, data.name),
    venue: venueFromStem(stem),
    ruleset: data.double_battle ? 'doubles' : 'singles',
    opponentTeam,
  };

  if (stem === 'leader_roark') {
    fight.label = 'Oreburgh Gym - Roark';
    fight.trainer = 'Leader Roark';
    fight.venue = 'Oreburgh Gym';
    const cranidos = fight.opponentTeam.find((m) => m.species === 408);
    if (cranidos) {
      cranidos.item = 'Oran Berry';
      cranidos.nature = 'Hardy';
      cranidos.ability = 'Mold Breaker';
      cranidos.stats = { hp: 45, atk: 35, def: 22, spa: 18, spd: 18, spe: 23 };
      cranidos.moves = [
        buildMove('MOVE_HEADBUTT'),
        buildMove('MOVE_PURSUIT'),
        buildMove('MOVE_LEER'),
        buildMove('MOVE_ROCK_TOMB'),
      ].filter(Boolean);
    }
  }

  fights.push(fight);
}

const catalog = { fights };
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`Wrote ${fights.length} fights to ${outPath}`);
