import { useEffect, useMemo, useState } from "react";

type PartyPokemon = {
  isEmpty: boolean;
  species: number;
  nickname?: string | null;
  speciesName?: string | null;
  level?: number | null;
  natureName?: string | null;
  abilityName?: string | null;
  heldItemName?: string | null;
  stats?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  types?: (number | null)[] | null;
  typeNames?: (string | null)[] | null;
  moves?: (number | null)[] | null;
  moveNames?: (string | null)[] | null;
};
type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
type StatSpread = Record<StatKey, number>;

type BattleCatalog = {
  fights: BattleFight[];
};
type EncounterRow = {
  area: string;
};

type BattleFight = {
  id: string;
  label: string;
  trainer: string;
  venue?: string | null;
  ruleset?: string | null;
  opponentTeam: BattlePokemon[];
};

type BattlePokemon = {
  species: number;
  speciesName?: string | null;
  level: number;
  types: string[];
  ability?: string | null;
  item?: string | null;
  nature?: string | null;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  moves: BattleMove[];
};

type BattleMove = {
  name: string;
  power: number;
  type: string;
  category: string;
  accuracy?: number | null;
};

type MoveMeta = {
  id: number;
  name: string;
  power: number;
  type: string;
  category: "physical" | "special" | "status";
  accuracy: number;
};

type DamageResult = {
  minDamage: number;
  maxDamage: number;
  minPct: number;
  maxPct: number;
  effectiveness: number;
  stab: number;
  koText: string;
};

type FieldState = {
  weather: "none" | "sun" | "rain" | "sand" | "hail";
  reflectPlayer: boolean;
  lightScreenPlayer: boolean;
  reflectEnemy: boolean;
  lightScreenEnemy: boolean;
};

const TYPE_ID_TO_NAME: Record<number, string> = {
  1: "Normal",
  2: "Fighting",
  3: "Flying",
  4: "Poison",
  5: "Ground",
  6: "Rock",
  7: "Bug",
  8: "Ghost",
  9: "Steel",
  10: "Fire",
  11: "Water",
  12: "Grass",
  13: "Electric",
  14: "Psychic",
  15: "Ice",
  16: "Dragon",
  17: "Dark",
  18: "Fairy",
};

const GEN3_EMERALD_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${dex}.png`;
const GEN3_FRLG_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/${dex}.png`;
const GEN4_PLAT_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/platinum/${dex}.png`;
const GEN5_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${dex}.png`;
const DEFAULT_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;
const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STORY_AREA_ORDER_EMERALD = [
  "Route 101",
  "Route 103",
  "Route 102",
  "Petalburg Woods",
  "Route 104",
  "Rustboro Gym",
  "Dewford Gym",
  "Route 110",
  "Mauville Gym",
  "Fiery Path",
  "Mt. Chimney",
  "Magma Hideout",
  "Lavaridge Gym",
  "Petalburg Gym",
  "Route 119",
  "Weather Institute",
  "Fortree Gym",
  "Lilycove City",
  "Mt. Pyre",
  "Team Aqua Hideout",
  "Mossdeep Space Center",
  "Mossdeep Gym",
  "Seafloor Cavern",
  "Sootopolis Gym",
  "Victory Road",
  "Pokemon League",
];
const STORY_AREA_ALIASES_EMERALD: Record<string, string> = {
  "mauville city gym": "Mauville Gym",
  "rustboro city gym": "Rustboro Gym",
  "dewford town gym": "Dewford Gym",
  "lavaridge town gym": "Lavaridge Gym",
  "petalburg city gym": "Petalburg Gym",
  "fortree city gym": "Fortree Gym",
  "mossdeep city gym": "Mossdeep Gym",
  "sootopolis city gym": "Sootopolis Gym",
};
const STORY_AREA_ORDER_PLATINUM = [
  "Route 201",
  "Route 202",
  "Route 203",
  "Oreburgh Gate",
  "Oreburgh Mine",
  "Oreburgh Gym",
  "Route 204",
  "Valley Windworks",
  "Route 205",
  "Eterna Forest",
  "Eterna Gym",
  "Route 206",
  "Route 207",
  "Mt. Coronet",
  "Route 208",
  "Route 209",
  "Route 210",
  "Route 215",
  "Veilstone Gym",
  "Route 214",
  "Route 213",
  "Pastoria Gym",
  "Route 212",
  "Hearthome Gym",
  "Route 218",
  "Iron Island",
  "Canalave Gym",
  "Route 216",
  "Route 217",
  "Snowpoint Gym",
  "Sunyshore Gym",
  "Route 223",
  "Victory Road",
  "Pokemon League",
];
const STORY_AREA_ALIASES_PLATINUM: Record<string, string> = {
  "oreburgh gym": "Oreburgh City Gym",
  "eterna gym": "Eterna City Gym",
  "veilstone gym": "Veilstone City Gym",
  "pastoria gym": "Pastoria City Gym",
  "hearthome gym": "Hearthome City Gym",
  "canalave gym": "Canalave City Gym",
  "snowpoint gym": "Snowpoint City Gym",
  "sunyshore gym": "Sunyshore City Gym",
  "valley windworks": "Valley Windworks Outside",
  "team galactic veilstone building": "Galactic HQ",
  "iron island cave": "Iron Island",
};
const NATURE_EFFECTS: Record<string, { up: Exclude<StatKey, "hp">; down: Exclude<StatKey, "hp"> } | null> = {
  Hardy: null,
  Lonely: { up: "atk", down: "def" },
  Brave: { up: "atk", down: "spe" },
  Adamant: { up: "atk", down: "spa" },
  Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" },
  Docile: null,
  Relaxed: { up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" },
  Hasty: { up: "spe", down: "def" },
  Serious: null,
  Jolly: { up: "spe", down: "spa" },
  Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" },
  Mild: { up: "spa", down: "def" },
  Quiet: { up: "spa", down: "spe" },
  Bashful: null,
  Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy: { up: "spd", down: "spe" },
  Careful: { up: "spd", down: "spa" },
  Quirky: null,
};

function capitalize(value: string) {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : value;
}

function normalizeAreaKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeSpeciesKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toPokeApiSpeciesName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/\s+/g, "-");
}

function getNatureMultiplier(natureName: string | null | undefined, stat: Exclude<StatKey, "hp">) {
  if (!natureName) return 1;
  const effect = NATURE_EFFECTS[natureName];
  if (!effect) return 1;
  if (effect.up === stat) return 1.1;
  if (effect.down === stat) return 0.9;
  return 1;
}

function calcGen4Stats(base: StatSpread, ivs: StatSpread, evs: StatSpread, level: number, natureName?: string | null): StatSpread {
  const lv = Math.max(1, level);
  const hp = Math.floor(((2 * base.hp + ivs.hp + Math.floor(evs.hp / 4)) * lv) / 100) + lv + 10;

  const calcOther = (key: Exclude<StatKey, "hp">) => {
    const preNature = Math.floor(((2 * base[key] + ivs[key] + Math.floor(evs[key] / 4)) * lv) / 100) + 5;
    return Math.floor(preNature * getNatureMultiplier(natureName, key));
  };

  return {
    hp,
    atk: calcOther("atk"),
    def: calcOther("def"),
    spa: calcOther("spa"),
    spd: calcOther("spd"),
    spe: calcOther("spe"),
  };
}

function inferFightArea(fight: BattleFight) {
  if (fight.venue?.trim()) return fight.venue.trim();

  const id = fight.id.toLowerCase();
  const routeMatch = id.match(/route_(\d{3})/);
  if (routeMatch) return `Route ${routeMatch[1]}`;

  const cityMatch = id.match(/([a-z]+)_city/);
  if (cityMatch) return capitalize(cityMatch[1]) + " City";

  const areaMatch = id.match(/([a-z]+)_area/);
  if (areaMatch) return capitalize(areaMatch[1]) + " Area";

  const townMatch = id.match(/([a-z]+)_town/);
  if (townMatch) return capitalize(townMatch[1]) + " Town";

  return "Other";
}

function getTypeEffectiveness(moveType: string, defenderTypes: string[]) {
  const t = moveType.toLowerCase();
  const chart: Record<string, Record<string, number>> = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ground: 2, flying: 2, dragon: 2, steel: 0.5, ice: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
  };

  let result = 1;
  const row = chart[t] ?? {};
  for (const d of defenderTypes) {
    const mult = row[d.toLowerCase()];
    if (typeof mult === "number") result *= mult;
  }
  return result;
}

function weatherModifier(moveType: string, weather: FieldState["weather"]) {
  const mt = moveType.toLowerCase();
  if (weather === "rain") {
    if (mt === "water") return 1.5;
    if (mt === "fire") return 0.5;
  }
  if (weather === "sun") {
    if (mt === "fire") return 1.5;
    if (mt === "water") return 0.5;
  }
  return 1;
}

function calcDamage(
  attacker: { level: number; atk: number; spa: number; types: string[] },
  defender: { hp: number; def: number; spd: number; types: string[] },
  move: { power: number; type: string; category: "physical" | "special" | "status" },
  field: FieldState,
  defendingSide: "player" | "enemy"
): DamageResult | null {
  if (move.category === "status" || move.power <= 0) return null;

  const A = move.category === "physical" ? attacker.atk : attacker.spa;
  let D = move.category === "physical" ? defender.def : defender.spd;
  if (A <= 0 || D <= 0 || defender.hp <= 0) return null;

  if (move.category === "physical") {
    if (defendingSide === "player" && field.reflectPlayer) D *= 2;
    if (defendingSide === "enemy" && field.reflectEnemy) D *= 2;
  } else {
    if (defendingSide === "player" && field.lightScreenPlayer) D *= 2;
    if (defendingSide === "enemy" && field.lightScreenEnemy) D *= 2;
  }

  const base = (((2 * attacker.level) / 5 + 2) * move.power * (A / D)) / 50 + 2;
  const stab = attacker.types.some((t) => t.toLowerCase() === move.type.toLowerCase()) ? 1.5 : 1;
  const effectiveness = getTypeEffectiveness(move.type, defender.types);
  const weather = weatherModifier(move.type, field.weather);
  const modifier = stab * effectiveness * weather;
  if (modifier <= 0) {
    return {
      minDamage: 0,
      maxDamage: 0,
      minPct: 0,
      maxPct: 0,
      effectiveness,
      stab,
      koText: "No effect",
    };
  }

  const minDamage = Math.max(0, Math.floor(base * modifier * 0.85));
  const maxDamage = Math.max(0, Math.floor(base * modifier));
  const minPct = (minDamage / defender.hp) * 100;
  const maxPct = (maxDamage / defender.hp) * 100;

  let koText = "No guaranteed 2HKO";
  if (minDamage >= defender.hp) koText = "Guaranteed OHKO";
  else if (maxDamage >= defender.hp) koText = "Possible OHKO";
  else if (minDamage * 2 >= defender.hp) koText = "Guaranteed 2HKO";
  else if (maxDamage * 2 >= defender.hp) koText = "Possible 2HKO";

  return { minDamage, maxDamage, minPct, maxPct, effectiveness, stab, koText };
}

async function loadMoveMetaBatch(ids: number[]): Promise<MoveMeta[]> {
  if (!ids.length) return [];
  const known: Record<number, MoveMeta> = {};
  try {
    const query = encodeURIComponent(ids.join(","));
    const r = await fetch(`/api/moves/meta?ids=${query}`);
    if (r.ok) {
      const data = (await r.json()) as Array<{
        id: number;
        name: string;
        power: number;
        type: string;
        category: string;
        accuracy: number;
      }>;

      for (const x of data) {
        if (!x || x.id <= 0) continue;
        known[x.id] = {
          id: x.id,
          name: x.name ?? `Move ${x.id}`,
          power: Number(x.power ?? 0) || 0,
          type: x.type ?? "Normal",
          category: (String(x.category ?? "status").toLowerCase() as MoveMeta["category"]),
          accuracy: Number(x.accuracy ?? 100) || 100,
        };
      }
    }
  } catch {
    // ignore, fallback below
  }

  const unknownIds = ids.filter((id) => {
    const m = known[id];
    if (!m) return true;
    return /^move\s+#?\d+$/i.test(m.name.trim());
  });

  if (unknownIds.length) {
    const fallbackList = await Promise.all(
      unknownIds.map(async (id) => {
        try {
          const r = await fetch(`https://pokeapi.co/api/v2/move/${id}`);
          if (!r.ok) return null;
          const j = await r.json();
          const meta: MoveMeta = {
            id,
            name: capitalize(String(j?.name ?? `Move ${id}`).replace(/-/g, " ")),
            power: Number(j?.power ?? 0) || 0,
            type: capitalize(String(j?.type?.name ?? "Normal")),
            category: String(j?.damage_class?.name ?? "status") as "physical" | "special" | "status",
            accuracy: Number(j?.accuracy ?? 100) || 100,
          };
          return meta;
        } catch {
          return null;
        }
      })
    );

    for (const m of fallbackList) {
      if (!m) continue;
      known[m.id] = m;
    }
  }

  return Object.values(known);
}

function DexSprite({
  dex,
  className,
  alt = "",
  gameMode = "emerald",
}: {
  dex: number;
  className?: string;
  alt?: string;
  gameMode?: "emerald" | "platinum";
}) {
  const [srcIdx, setSrcIdx] = useState(0);
  const sources = useMemo(
    () =>
      gameMode === "platinum"
        ? [GEN4_PLAT_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)]
        : [GEN3_EMERALD_SPRITE(dex), GEN3_FRLG_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)],
    [dex, gameMode]
  );

  useEffect(() => {
    setSrcIdx(0);
  }, [dex]);

  return (
    <img
      className={className}
      src={sources[srcIdx]}
      alt={alt}
      onError={() => {
        setSrcIdx((i) => (i + 1 < sources.length ? i + 1 : i));
      }}
    />
  );
}

export default function BattleSim({ party, gameMode }: { party: PartyPokemon[]; gameMode: "emerald" | "platinum" }) {
  const [catalog, setCatalog] = useState<BattleCatalog>({ fights: [] });
  const [encounterAreaOrder, setEncounterAreaOrder] = useState<string[]>([]);
  const [mainStoryOnly, setMainStoryOnly] = useState(gameMode === "emerald");
  const [selectedArea, setSelectedArea] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [fightSearch, setFightSearch] = useState("");
  const [selectedFightId, setSelectedFightId] = useState("");
  const [playerIdx, setPlayerIdx] = useState(0);
  const [enemyIdx, setEnemyIdx] = useState(0);
  const [selectedPlayerMoveIdx, setSelectedPlayerMoveIdx] = useState(0);
  const [selectedEnemyMoveIdx, setSelectedEnemyMoveIdx] = useState(0);
  const [moveMetaCache, setMoveMetaCache] = useState<Record<number, MoveMeta>>({});
  const [speciesBaseStatsCache, setSpeciesBaseStatsCache] = useState<Record<number, StatSpread>>({});
  const [speciesIdByNameCache, setSpeciesIdByNameCache] = useState<Record<string, number>>({});
  const [field, setField] = useState<FieldState>({
    weather: "none",
    reflectPlayer: false,
    lightScreenPlayer: false,
    reflectEnemy: false,
    lightScreenEnemy: false,
  });

  const playerTeam = useMemo(() => party.filter((p) => !p.isEmpty && p.species > 0), [party]);
  const visibleFights = useMemo(() => {
    if (!mainStoryOnly) return catalog.fights;
    return catalog.fights.filter((fight) => Boolean(fight.venue?.trim()));
  }, [catalog.fights, mainStoryOnly]);
  const areas = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const fight of visibleFights) {
      const area = inferFightArea(fight);
      if (seen.has(area)) continue;
      seen.add(area);
      ordered.push(area);
    }
    const firstSeenRank = new Map<string, number>();
    ordered.forEach((area, idx) => firstSeenRank.set(area, idx));

    const storyRank = new Map<string, number>();
    const orderedByNorm = new Map<string, string>();
    for (const area of ordered) {
      orderedByNorm.set(normalizeAreaKey(area), area);
    }

    const storyOrder = gameMode === "platinum" ? STORY_AREA_ORDER_PLATINUM : STORY_AREA_ORDER_EMERALD;
    const storyAliases = gameMode === "platinum" ? STORY_AREA_ALIASES_PLATINUM : STORY_AREA_ALIASES_EMERALD;

    let rankCounter = 0;
    for (const raw of storyOrder) {
      const normalized = normalizeAreaKey(raw);
      const alias = storyAliases[normalized];
      const resolved = orderedByNorm.get(normalized) ?? (alias ? orderedByNorm.get(normalizeAreaKey(alias)) : undefined);
      if (!resolved || storyRank.has(resolved)) continue;
      storyRank.set(resolved, rankCounter++);
    }

    const encounterRank = new Map<string, number>();
    for (let i = 0; i < encounterAreaOrder.length; i++) {
      encounterRank.set(normalizeAreaKey(encounterAreaOrder[i]), i);
    }

    return [...ordered].sort((a, b) => {
      const sa = storyRank.get(a);
      const sb = storyRank.get(b);
      if (sa !== undefined && sb !== undefined) return sa - sb;
      if (sa !== undefined) return -1;
      if (sb !== undefined) return 1;

      const ea = encounterRank.get(normalizeAreaKey(a));
      const eb = encounterRank.get(normalizeAreaKey(b));
      if (ea !== undefined && eb !== undefined) return ea - eb;
      if (ea !== undefined) return -1;
      if (eb !== undefined) return 1;

      return (firstSeenRank.get(a) ?? 0) - (firstSeenRank.get(b) ?? 0);
    });
  }, [visibleFights, encounterAreaOrder, gameMode]);
  const filteredAreas = useMemo(() => {
    const query = areaSearch.trim().toLowerCase();
    if (!query) return areas;
    return areas.filter((a) => a.toLowerCase().includes(query));
  }, [areas, areaSearch]);
  const areaFights = useMemo(
    () => visibleFights.filter((f) => inferFightArea(f) === selectedArea),
    [visibleFights, selectedArea]
  );
  const filteredAreaFights = useMemo(() => {
    const query = fightSearch.trim().toLowerCase();
    if (!query) return areaFights;
    return areaFights.filter((f) => f.label.toLowerCase().includes(query) || f.trainer.toLowerCase().includes(query));
  }, [areaFights, fightSearch]);
  const selectedFight = useMemo(
    () => areaFights.find((f) => f.id === selectedFightId) ?? areaFights[0] ?? null,
    [areaFights, selectedFightId]
  );
  const selectedPlayer = playerTeam[playerIdx] ?? null;
  const selectedEnemy = selectedFight?.opponentTeam[enemyIdx] ?? null;
  const getBattleDexId = (p: BattlePokemon | null | undefined) => {
    if (!p) return 0;
    const key = p.speciesName ? normalizeSpeciesKey(p.speciesName) : "";
    return (key && speciesIdByNameCache[key]) || p.species;
  };

  useEffect(() => {
    fetch("/api/battles")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: BattleCatalog | null) => {
        if (!j?.fights?.length) return;
        setCatalog(j);
        setSelectedFightId(j.fights[0].id);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  useEffect(() => {
    fetch("/api/encounters")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: EncounterRow[] | null) => {
        if (!rows?.length) return;
        setEncounterAreaOrder(rows.map((x) => x.area).filter((x): x is string => Boolean(x?.trim())));
      })
      .catch(() => {
        // ignore, area fallback order still works
      });
  }, []);

  useEffect(() => {
    setMainStoryOnly(gameMode === "emerald");
  }, [gameMode]);

  useEffect(() => {
    if (!areas.length) return;
    if (!selectedArea || !areas.includes(selectedArea)) {
      setSelectedArea(areas[0]);
    }
  }, [areas, selectedArea]);

  useEffect(() => {
    if (!areaFights.length) return;
    if (!areaFights.some((f) => f.id === selectedFightId)) {
      setSelectedFightId(areaFights[0].id);
    }
  }, [areaFights, selectedFightId]);

  useEffect(() => {
    setFightSearch("");
  }, [selectedArea]);

  useEffect(() => {
    setEnemyIdx(0);
    setSelectedEnemyMoveIdx(0);
  }, [selectedFightId]);

  useEffect(() => {
    setSelectedPlayerMoveIdx(0);
  }, [playerIdx]);

  useEffect(() => {
    const mons = selectedFight?.opponentTeam ?? [];
    const names = mons
      .map((m) => m.speciesName?.trim())
      .filter((n): n is string => Boolean(n))
      .filter((n) => !speciesIdByNameCache[normalizeSpeciesKey(n)]);
    if (!names.length) return;

    const unique = [...new Set(names)];
    let cancelled = false;

    Promise.all(
      unique.map(async (name) => {
        try {
          const apiName = toPokeApiSpeciesName(name);
          const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(apiName)}`);
          if (!r.ok) return null;
          const j = await r.json();
          const id = Number(j?.id ?? 0) || 0;
          if (id <= 0) return null;
          return { key: normalizeSpeciesKey(name), id };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const row of rows) {
        if (!row) continue;
        next[row.key] = row.id;
      }
      if (Object.keys(next).length) {
        setSpeciesIdByNameCache((prev) => ({ ...prev, ...next }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedFight, speciesIdByNameCache]);

  useEffect(() => {
    const ids = (selectedPlayer?.moves ?? []).filter((m): m is number => typeof m === "number" && m > 0);
    const needed = ids.filter((id) => !moveMetaCache[id]);
    if (!needed.length) return;
    let canceled = false;

    loadMoveMetaBatch(needed).then((list) => {
      if (canceled) return;
      const next: Record<number, MoveMeta> = {};
      for (const m of list) {
        next[m.id] = m;
      }
      if (Object.keys(next).length) {
        setMoveMetaCache((prev) => ({ ...prev, ...next }));
      }
    }).catch(() => {
      // ignore metadata fetch failures, placeholder move rows are still shown
    });

    return () => {
      canceled = true;
    };
  }, [selectedPlayer?.moves, moveMetaCache]);

  useEffect(() => {
    const species = selectedPlayer?.species ?? 0;
    if (species <= 0) return;
    if (speciesBaseStatsCache[species]) return;

    const controller = new AbortController();
    fetch(`https://pokeapi.co/api/v2/pokemon/${species}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.stats || !Array.isArray(j.stats)) return;
        const byName: Record<string, number> = {};
        for (const row of j.stats) {
          const name = String(row?.stat?.name ?? "").trim().toLowerCase();
          const value = Number(row?.base_stat ?? 0) || 0;
          if (!name || value <= 0) continue;
          byName[name] = value;
        }

        const base: StatSpread = {
          hp: byName["hp"] ?? 0,
          atk: byName["attack"] ?? 0,
          def: byName["defense"] ?? 0,
          spa: byName["special-attack"] ?? 0,
          spd: byName["special-defense"] ?? 0,
          spe: byName["speed"] ?? 0,
        };

        if (STAT_KEYS.every((k) => base[k] > 0)) {
          setSpeciesBaseStatsCache((prev) => ({ ...prev, [species]: base }));
        }
      })
      .catch(() => {
        // ignore base stat fetch failures
      });

    return () => controller.abort();
  }, [selectedPlayer?.species, speciesBaseStatsCache]);

  const selectedPlayerComputedStats = useMemo(() => {
    if (!selectedPlayer) return null;
    const species = selectedPlayer.species ?? 0;
    const level = selectedPlayer.level ?? 0;
    if (species <= 0 || level <= 0) return null;

    const base = speciesBaseStatsCache[species];
    if (!base) return null;

    const ivs: StatSpread = {
      hp: selectedPlayer.ivs?.hp ?? 0,
      atk: selectedPlayer.ivs?.atk ?? 0,
      def: selectedPlayer.ivs?.def ?? 0,
      spa: selectedPlayer.ivs?.spa ?? 0,
      spd: selectedPlayer.ivs?.spd ?? 0,
      spe: selectedPlayer.ivs?.spe ?? 0,
    };
    const evs: StatSpread = {
      hp: selectedPlayer.evs?.hp ?? 0,
      atk: selectedPlayer.evs?.atk ?? 0,
      def: selectedPlayer.evs?.def ?? 0,
      spa: selectedPlayer.evs?.spa ?? 0,
      spd: selectedPlayer.evs?.spd ?? 0,
      spe: selectedPlayer.evs?.spe ?? 0,
    };

    return calcGen4Stats(base, ivs, evs, level, selectedPlayer.natureName ?? null);
  }, [selectedPlayer, speciesBaseStatsCache]);

  const playerTypes = useMemo(() => {
    if (!selectedPlayer) return [];
    const byName = (selectedPlayer.typeNames ?? []).filter((x): x is string => Boolean(x?.trim()));
    if (byName.length) return byName.map(capitalize);
    return (selectedPlayer.types ?? [])
      .filter((x): x is number => typeof x === "number" && x > 0)
      .map((id) => TYPE_ID_TO_NAME[id] ?? `Type ${id}`);
  }, [selectedPlayer]);

  const playerMoves: MoveMeta[] = useMemo(() => {
    if (!selectedPlayer) return [];
    const ids = selectedPlayer.moves ?? [];
    const names = selectedPlayer.moveNames ?? [];
    const list: MoveMeta[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!id || id <= 0) continue;
      const cached = moveMetaCache[id];
      if (cached) {
        list.push(cached);
        continue;
      }
      list.push({
        id,
        name: names[i] ?? `Move ${id}`,
        power: 0,
        type: "Normal",
        category: "status",
        accuracy: 100,
      });
    }
    return list;
  }, [selectedPlayer, moveMetaCache]);

  const enemyMoves = selectedEnemy?.moves ?? [];
  const selectedPlayerMove = playerMoves[selectedPlayerMoveIdx] ?? null;
  const selectedEnemyMove = enemyMoves[selectedEnemyMoveIdx] ?? null;

  const playerMoveResults = useMemo(() => {
    const playerStats = selectedPlayerComputedStats ?? selectedPlayer?.stats ?? null;
    if (!selectedPlayer || !selectedEnemy || !playerStats) return [];
    const attacker = {
      level: selectedPlayer.level ?? selectedEnemy.level,
      atk: playerStats.atk,
      spa: playerStats.spa,
      types: playerTypes,
    };
    const defender = {
      hp: selectedEnemy.stats.hp,
      def: selectedEnemy.stats.def,
      spd: selectedEnemy.stats.spd,
      types: selectedEnemy.types,
    };

    return playerMoves.map((move) => {
      const result = calcDamage(attacker, defender, move, field, "enemy");
      return { move, result };
    });
  }, [selectedPlayer, selectedEnemy, playerMoves, playerTypes, field, selectedPlayerComputedStats]);

  const enemyMoveResults = useMemo(() => {
    const playerStats = selectedPlayerComputedStats ?? selectedPlayer?.stats ?? null;
    if (!selectedPlayer || !selectedEnemy || !playerStats) return [];
    const attacker = {
      level: selectedEnemy.level,
      atk: selectedEnemy.stats.atk,
      spa: selectedEnemy.stats.spa,
      types: selectedEnemy.types,
    };
    const defender = {
      hp: playerStats.hp,
      def: playerStats.def,
      spd: playerStats.spd,
      types: playerTypes,
    };

    return enemyMoves.map((move) => {
      const normalized = {
        power: move.power,
        type: move.type,
        category: move.category.toLowerCase() as "physical" | "special" | "status",
      };
      const result = calcDamage(attacker, defender, normalized, field, "player");
      return { move, result };
    });
  }, [selectedPlayer, selectedEnemy, playerTypes, enemyMoves, field, selectedPlayerComputedStats]);

  const selectedPlayerMoveResult = playerMoveResults[selectedPlayerMoveIdx]?.result ?? null;
  const selectedEnemyMoveResult = enemyMoveResults[selectedEnemyMoveIdx]?.result ?? null;

  return (
    <main className="battleLayout">
      <aside className="battleTeamPanel panel">
        <div className="panelTitle">Player Team</div>
        <div className="battleTeamList">
          {!playerTeam.length ? <div className="hint">No party loaded yet. Load a save first.</div> : null}
          {playerTeam.map((p, idx) => (
            <button
              key={`${p.species}:${idx}`}
              className={`battleMonBtn ${playerIdx === idx ? "active" : ""}`}
              onClick={() => setPlayerIdx(idx)}
            >
              <DexSprite dex={p.species} className="battleMiniSprite" alt="" gameMode={gameMode} />
              <div>
                <div className="battleMonName">{p.nickname ?? p.speciesName ?? `#${p.species}`}</div>
                <div className="battleMonSub">Lv {p.level ?? "?"}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="battleMain panel">
        <div className="panelTitle row">
          <span>Battle Sim</span>
          <div className="battleSelectors">
            <div className="battleSelectBlock">
              <div className="battleSelectTitle">Area</div>
              <input
                className="battleSearchInput"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                placeholder="Search area..."
              />
              <select className="battleListSelect" size={5} value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
                {filteredAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>

            <div className="battleSelectBlock">
              <div className="battleSelectTitle">Fights In Area</div>
              <input
                className="battleSearchInput"
                value={fightSearch}
                onChange={(e) => setFightSearch(e.target.value)}
                placeholder="Search fight..."
              />
              <select className="battleListSelect" size={5} value={selectedFightId} onChange={(e) => setSelectedFightId(e.target.value)}>
                {filteredAreaFights.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedFight ? (
          <>
            <div className="battleMeta">
              <label className="battleFieldRow check">
                <input type="checkbox" checked={mainStoryOnly} onChange={(e) => setMainStoryOnly(e.target.checked)} />
                Main story only
              </label>
              <span className="pill">{selectedFight.trainer}</span>
              {selectedFight.venue ? <span className="pill">{selectedFight.venue}</span> : null}
              <span className="pill">Rules: {selectedFight.ruleset ?? "singles"}</span>
            </div>

            <div className="battleTopMoves">
              <div className="battleMoveList">
                <div className="battleMoveListTitle">Your Moves</div>
                {playerMoveResults.map((entry, i) => (
                  <button
                    key={`${entry.move.id}:${i}`}
                    className={`battleMoveRow ${selectedPlayerMoveIdx === i ? "active" : ""}`}
                    onClick={() => setSelectedPlayerMoveIdx(i)}
                  >
                    <span>{entry.move.name}</span>
                    <span>
                      {entry.result ? `${entry.result.minPct.toFixed(1)} - ${entry.result.maxPct.toFixed(1)}%` : "Status"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="battleSprites">
                {selectedPlayer ? <DexSprite dex={selectedPlayer.species} className="battleHeroSprite" alt="" gameMode={gameMode} /> : null}
                {selectedEnemy ? <DexSprite dex={getBattleDexId(selectedEnemy)} className="battleHeroSprite" alt="" gameMode={gameMode} /> : null}
              </div>

              <div className="battleMoveList">
                <div className="battleMoveListTitle">Opponent Moves</div>
                {enemyMoveResults.map((entry, i) => (
                  <button
                    key={`${entry.move.name}:${i}`}
                    className={`battleMoveRow ${selectedEnemyMoveIdx === i ? "active" : ""}`}
                    onClick={() => setSelectedEnemyMoveIdx(i)}
                  >
                    <span>{entry.move.name}</span>
                    <span>
                      {entry.result ? `${entry.result.minPct.toFixed(1)} - ${entry.result.maxPct.toFixed(1)}%` : "Status"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="battleSummary">
              {selectedPlayerMove && selectedPlayerMoveResult ? (
                <div>
                  <b>{selectedPlayerMove.name}</b>: {selectedPlayerMoveResult.minDamage}-{selectedPlayerMoveResult.maxDamage} (
                  {selectedPlayerMoveResult.minPct.toFixed(1)}-{selectedPlayerMoveResult.maxPct.toFixed(1)}%) | {selectedPlayerMoveResult.koText}
                </div>
              ) : null}
              {selectedEnemyMove && selectedEnemyMoveResult ? (
                <div>
                  <b>{selectedEnemyMove.name}</b>: {selectedEnemyMoveResult.minDamage}-{selectedEnemyMoveResult.maxDamage} (
                  {selectedEnemyMoveResult.minPct.toFixed(1)}-{selectedEnemyMoveResult.maxPct.toFixed(1)}%) | {selectedEnemyMoveResult.koText}
                </div>
              ) : null}
            </div>

            <div className="battleCards">
              <div className="battleCard">
                <div className="battleCardTitle">Pokemon 1</div>
                {selectedPlayer ? (
                  <>
                    <div className="battleName">{selectedPlayer.nickname ?? selectedPlayer.speciesName ?? `#${selectedPlayer.species}`}</div>
                    <div className="battleLine">Level: {selectedPlayer.level ?? "?"}</div>
                    <div className="battleLine">Type: {playerTypes.join(" / ") || "—"}</div>
                    <div className="battleLine">Nature: {selectedPlayer.natureName ?? "—"}</div>
                    <div className="battleLine">Ability: {selectedPlayer.abilityName ?? "—"}</div>
                    <div className="battleLine">Item: {selectedPlayer.heldItemName ?? "—"}</div>
                    {(selectedPlayerComputedStats ?? selectedPlayer.stats) ? (
                      <div className="battleStatGrid">
                        <span>HP {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.hp}</span>
                        <span>ATK {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.atk}</span>
                        <span>DEF {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.def}</span>
                        <span>SpA {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.spa}</span>
                        <span>SpD {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.spd}</span>
                        <span>SPE {(selectedPlayerComputedStats ?? selectedPlayer.stats)?.spe}</span>
                      </div>
                    ) : (
                      <div className="hint">Stats unavailable.</div>
                    )}
                  </>
                ) : (
                  <div className="hint">No party Pokemon loaded.</div>
                )}
              </div>

              <div className="battleFieldCard">
                <div className="battleCardTitle">Field</div>
                <label className="battleFieldRow">
                  <span>Weather</span>
                  <select
                    value={field.weather}
                    onChange={(e) => setField((f) => ({ ...f, weather: e.target.value as FieldState["weather"] }))}
                  >
                    <option value="none">None</option>
                    <option value="sun">Sun</option>
                    <option value="rain">Rain</option>
                    <option value="sand">Sand</option>
                    <option value="hail">Hail</option>
                  </select>
                </label>
                <label className="battleFieldRow check">
                  <input
                    type="checkbox"
                    checked={field.reflectPlayer}
                    onChange={(e) => setField((f) => ({ ...f, reflectPlayer: e.target.checked }))}
                  />
                  Player Reflect
                </label>
                <label className="battleFieldRow check">
                  <input
                    type="checkbox"
                    checked={field.lightScreenPlayer}
                    onChange={(e) => setField((f) => ({ ...f, lightScreenPlayer: e.target.checked }))}
                  />
                  Player Light Screen
                </label>
                <label className="battleFieldRow check">
                  <input
                    type="checkbox"
                    checked={field.reflectEnemy}
                    onChange={(e) => setField((f) => ({ ...f, reflectEnemy: e.target.checked }))}
                  />
                  Enemy Reflect
                </label>
                <label className="battleFieldRow check">
                  <input
                    type="checkbox"
                    checked={field.lightScreenEnemy}
                    onChange={(e) => setField((f) => ({ ...f, lightScreenEnemy: e.target.checked }))}
                  />
                  Enemy Light Screen
                </label>
              </div>

              <div className="battleCard">
                <div className="battleCardTitle">Pokemon 2</div>
                {selectedEnemy ? (
                  <>
                    <div className="battleName">{selectedEnemy.speciesName ?? `#${selectedEnemy.species}`}</div>
                    <div className="battleLine">Level: {selectedEnemy.level}</div>
                    <div className="battleLine">Type: {selectedEnemy.types.join(" / ") || "—"}</div>
                    <div className="battleLine">Nature: {selectedEnemy.nature ?? "—"}</div>
                    <div className="battleLine">Ability: {selectedEnemy.ability ?? "—"}</div>
                    <div className="battleLine">Item: {selectedEnemy.item ?? "—"}</div>
                    <div className="battleStatGrid">
                      <span>HP {selectedEnemy.stats.hp}</span>
                      <span>ATK {selectedEnemy.stats.atk}</span>
                      <span>DEF {selectedEnemy.stats.def}</span>
                      <span>SpA {selectedEnemy.stats.spa}</span>
                      <span>SpD {selectedEnemy.stats.spd}</span>
                      <span>SPE {selectedEnemy.stats.spe}</span>
                    </div>
                  </>
                ) : (
                  <div className="hint">No opponent selected.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="hint">No battles found. Add entries to run/battles_emerald.json.</div>
        )}
      </section>

      <aside className="battleTeamPanel panel">
        <div className="panelTitle">Opponent Team</div>
        <div className="battleTeamList">
          {(selectedFight?.opponentTeam ?? []).map((p, idx) => (
            <button
              key={`${p.species}:${idx}`}
              className={`battleMonBtn ${enemyIdx === idx ? "active" : ""}`}
              onClick={() => setEnemyIdx(idx)}
            >
              <DexSprite dex={getBattleDexId(p)} className="battleMiniSprite" alt="" gameMode={gameMode} />
              <div>
                <div className="battleMonName">{p.speciesName ?? `#${p.species}`}</div>
                <div className="battleMonSub">Lv {p.level}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
