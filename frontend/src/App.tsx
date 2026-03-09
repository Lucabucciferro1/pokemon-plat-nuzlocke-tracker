import { useEffect, useMemo, useRef, useState } from "react";
import "./app.css";
import BattleSim from "./BattleSim";

type Trainer = {
  name: string;
  tid?: number | null;
  sid?: number | null;
  money?: number | null;
  playTime?: { hours?: number | null; minutes?: number | null };
};

type Pokemon = {
  isEmpty: boolean;
  species: number;
  nickname?: string | null;
  level?: number | null;

  nature?: number | null;
  natureName?: string | null;

  ability?: number | null;
  abilityName?: string | null;

  heldItem?: number | null;
  heldItemName?: string | null;

  moves?: (number | null)[] | null;
  moveNames?: (string | null)[] | null;

  gender?: number | null;
  shiny?: boolean | null;

  stats?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;

  types?: (number | null)[] | null;
  typeNames?: (string | null)[] | null;

  speciesName?: string | null;

  metLocation?: number | null;
  metLocationName?: string | null;
};

type BoxSlot = {
  box: number;
  slot: number;
  isEmpty: boolean;
  species: number;
  nickname?: string | null;
  level?: number | null;
  speciesName?: string | null;
  metLocationName?: string | null;
};

type StatePayload = {
  file?: { path?: string };
  game?: { mode?: "emerald" | "platinum"; generation?: number; version?: string };
  watching?: string;
  status?: string;
  trainer?: Trainer;
  party?: Pokemon[];
  boxes?: BoxSlot[];
  boxNames?: string[];
  updatedAt?: string;
};

type EncounterRow = {
  area: string;
  status: "empty" | "caught";
  species?: number | null;
  speciesName?: string | null;
  nickname?: string | null;
  entryStatus?: string | null;
  familyRoot?: number | null;
};

type EncounterTableSlot = {
  species: number;
  speciesName?: string | null;
  minLevel: number;
  maxLevel: number;
  rate?: number | null;
  isDupes: boolean;
  subsection?: string | null;
  subsections?: string[];
};

type EncounterTableMethod = {
  method: string;
  slots: EncounterTableSlot[];
};

type EncounterTimeOfDay = "morning" | "day" | "night";

const GEN3_EMERALD_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${dex}.png`;
const GEN3_FRLG_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/${dex}.png`;
const GEN4_PLAT_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/platinum/${dex}.png`;
const DEFAULT_SPRITE = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;

const XY_ANIM_BY_NAME = (name: string) => `https://play.pokemonshowdown.com/sprites/xyani/${name.toLowerCase()}.gif`;

const NATURE_EFFECTS: Record<string, { up: keyof NonNullable<Pokemon["stats"]>; down: keyof NonNullable<Pokemon["stats"]> } | null> = {
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

const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
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

const EMERALD_STARTER_SPECIES = new Set<number>([
  252, 253, 254, // Treecko line
  255, 256, 257, // Torchic line
  258, 259, 260, // Mudkip line
]);
const PLATINUM_STARTER_SPECIES = new Set<number>([
  387, 388, 389, // Turtwig line
  390, 391, 392, // Chimchar line
  393, 394, 395, // Piplup line
]);
const STARTER_AREA_LABEL = "Starter Pokemon";

function GenderBadge({ gender }: { gender?: number | null }) {
  if (gender === 0) return <span className="gender male">♂</span>;
  if (gender === 1) return <span className="gender female">♀</span>;
  return <span className="gender neutral">–</span>;
}

function StatArrow({ dir }: { dir: "up" | "down" }) {
  return <span className={`arrow ${dir}`}>{dir === "up" ? "▲" : "▼"}</span>;
}

function fmtLevelRange(min: number, max: number) {
  return min === max ? `Lv ${min}` : `Lv ${min}-${max}`;
}

function getCondensedAreaName(area?: string | null) {
  if (!area) return "";
  return area
    .replace(/\s+(B?\d+F)(?:\s+\d+R)?$/i, "")
    .replace(/\s+\d+R$/i, "")
    .replace(/\s+Room\d+$/i, "")
    .replace(/\s+Hidden Floor(?:\s+Corridors?)?$/i, "")
    .replace(/\s+(?:Rooms?|Corridors?|Entrance)$/i, "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAreaSubsection(area: string, condensedArea: string) {
  const source = area.trim();
  const base = condensedArea.trim();
  if (!source || !base) return null;
  if (normalizeAreaKey(source) === normalizeAreaKey(base)) return null;

  const prefix = new RegExp(`^${escapeRegExp(base)}\\s*`, "i");
  const subsection = source.replace(prefix, "").trim();
  return subsection.length ? subsection : null;
}

function aggregateEncounterSlots(slots: EncounterTableSlot[]): EncounterTableSlot[] {
  const bySpecies = new Map<number, EncounterTableSlot>();

  for (const slot of slots) {
    if (slot.species <= 0) continue;
    const existing = bySpecies.get(slot.species);
    if (!existing) {
      bySpecies.set(slot.species, { ...slot });
      continue;
    }

    existing.minLevel = Math.min(existing.minLevel, slot.minLevel);
    existing.maxLevel = Math.max(existing.maxLevel, slot.maxLevel);
    existing.isDupes = existing.isDupes || slot.isDupes;

    const existingRate = typeof existing.rate === "number" ? existing.rate : 0;
    const incomingRate = typeof slot.rate === "number" ? slot.rate : 0;
    const combinedRate = existingRate + incomingRate;
    existing.rate = combinedRate > 0 ? Number(combinedRate.toFixed(2)) : null;
    const subsectionSet = new Set<string>([...(existing.subsections ?? []), ...(slot.subsections ?? [])]);
    existing.subsections = subsectionSet.size ? Array.from(subsectionSet) : undefined;

    if (!existing.speciesName && slot.speciesName) {
      existing.speciesName = slot.speciesName;
    }
  }

  return Array.from(bySpecies.values()).sort((a, b) => {
    if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
    return a.species - b.species;
  });
}

function normalizeAreaKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function typeColor(typeName: string) {
  return TYPE_COLORS[typeName.toLowerCase()] ?? "#6b7280";
}

function DexSprite({ dex, className, alt = "", gameMode = "emerald" }: { dex: number; className?: string; alt?: string; gameMode?: "emerald" | "platinum" }) {
  const [srcIdx, setSrcIdx] = useState(0);
  const sources = useMemo(
    () =>
      gameMode === "platinum"
        ? [GEN4_PLAT_SPRITE(dex), DEFAULT_SPRITE(dex)]
        : [GEN3_EMERALD_SPRITE(dex), GEN3_FRLG_SPRITE(dex), DEFAULT_SPRITE(dex)],
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

function sortEncounterMethods(methods: EncounterTableMethod[]) {
  const priority: Record<string, number> = {
    Grass: 1,
    Surf: 2,
    "Old Rod": 3,
    "Good Rod": 4,
    "Super Rod": 5,
  };

  return [...methods].sort((a, b) => {
    const pa = priority[a.method] ?? 99;
    const pb = priority[b.method] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.method.localeCompare(b.method);
  });
}

export default function App() {
  const [view, setView] = useState<"dashboard" | "encounters" | "battle">("dashboard");

  const [data, setData] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savePath, setSavePath] = useState("");
  const [isWatchingSave, setIsWatchingSave] = useState(false);
  const [isBrowsingSave, setIsBrowsingSave] = useState(false);

  const [activeBox, setActiveBox] = useState(0);
  const [selected, setSelected] = useState<{
    source: "party" | "box";
    index: number;
    dex: number;
    speciesName?: string | null;
  } | null>(null);

  const [boxDetails, setBoxDetails] = useState<Pokemon | null>(null);
  const lastUpdatedAtRef = useRef<string | null>(null);
  const lastAutoJumpKeyRef = useRef<string>("");
  const encounterTableReqSeqRef = useRef(0);
  const encounterTableAbortRef = useRef<AbortController | null>(null);

  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [caughtFamilies, setCaughtFamilies] = useState<number[]>([]);

  const [routeSearch, setRouteSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [activeMethod, setActiveMethod] = useState<string>("");
  const [encounterTable, setEncounterTable] = useState<EncounterTableMethod[]>([]);
  const [encounterTimeOfDay, setEncounterTimeOfDay] = useState<EncounterTimeOfDay>("day");
  const [encLoadError, setEncLoadError] = useState<string | null>(null);
  const [encLoading, setEncLoading] = useState(false);
  const [speciesTypeCache, setSpeciesTypeCache] = useState<Record<number, string[]>>({});
  const gameMode: "emerald" | "platinum" = data?.game?.mode === "platinum" ? "platinum" : "emerald";
  const starterSpecies = gameMode === "platinum" ? PLATINUM_STARTER_SPECIES : EMERALD_STARTER_SPECIES;

  useEffect(() => {
    if (gameMode !== "platinum" && encounterTimeOfDay !== "day") {
      setEncounterTimeOfDay("day");
    }
  }, [gameMode, encounterTimeOfDay]);

  async function loadState() {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const json: StatePayload = await res.json();
      setData(json);
      const watched = json.file?.path ?? json.watching;
      if (watched) {
        setSavePath((prev) => (prev.trim() ? prev : watched));
      }
      setError(null);
      if (json.updatedAt && json.updatedAt !== lastUpdatedAtRef.current) {
        lastUpdatedAtRef.current = json.updatedAt;
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function watchSavePath(pathOverride?: string) {
    const path = (pathOverride ?? savePath).trim();
    if (!path) {
      setError("Save path is required.");
      return;
    }

    setIsWatchingSave(true);
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error ?? json?.detail ?? json?.title ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const watched = json?.watching ?? path;
      setSavePath(watched);
      setError(null);
      await Promise.all([loadState(), loadEncounters(), loadFamilies()]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIsWatchingSave(false);
    }
  }

  async function browseSavePath() {
    setIsBrowsingSave(true);
    try {
      const res = await fetch("/api/browse-save");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error ?? json?.detail ?? json?.title ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const picked = json?.path as string | undefined;
      if (!picked) {
        return;
      }

      setSavePath(picked);
      await watchSavePath(picked);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIsBrowsingSave(false);
    }
  }

  async function loadEncounters() {
    try {
      const r = await fetch("/api/encounters");
      if (!r.ok) return;
      const rows: EncounterRow[] = await r.json();
      setEncounters(rows);

      setSelectedArea((prev) => {
        if (!rows.length) return "";
        if (!prev) return rows[0].area;
        return rows.some((x) => x.area === prev) ? prev : rows[0].area;
      });
    } catch {
      // ignore
    }
  }

  async function loadFamilies() {
    try {
      const r = await fetch("/api/encounters/families");
      if (!r.ok) return;
      const j = await r.json();
      setCaughtFamilies(j.families ?? []);
    } catch {
      // ignore
    }
  }

  async function loadEncounterTable(area: string, timeOfDay: EncounterTimeOfDay = encounterTimeOfDay) {
    if (!area) return;
    encounterTableAbortRef.current?.abort();
    const controller = new AbortController();
    encounterTableAbortRef.current = controller;
    const reqSeq = ++encounterTableReqSeqRef.current;

    setEncounterTable([]);
    setActiveMethod("");
    setEncLoading(true);
    setEncLoadError(null);
    try {
      const group = areaGroupByArea.get(area);
      const groupLabel = group?.label ?? getCondensedAreaName(area);
      const areasToLoad = group?.areas?.length ? group.areas : [area];
      const query = new URLSearchParams({ timeOfDay });
      const tablesByArea = await Promise.all(
        areasToLoad.map(async (areaName) => {
          const r = await fetch(`/api/encounters/table/${encodeURIComponent(areaName)}?${query.toString()}`, { signal: controller.signal });
          if (!r.ok) throw new Error(await r.text());
          const table = await r.json() as EncounterTableMethod[];
          return { areaName, table };
        })
      );

      const mergedByMethod = new Map<string, EncounterTableMethod>();
      for (const { areaName, table } of tablesByArea) {
        const areaSubsection = getAreaSubsection(areaName, groupLabel);
        for (const method of table) {
          const existing = mergedByMethod.get(method.method);
          if (!existing) {
            mergedByMethod.set(method.method, {
              method: method.method,
              slots: method.slots.map((slot) => {
                const tags = new Set<string>();
                if (slot.subsection?.trim()) tags.add(slot.subsection.trim());
                if (areaSubsection?.trim()) tags.add(areaSubsection.trim());
                return {
                  ...slot,
                  subsections: tags.size ? Array.from(tags) : undefined,
                };
              }),
            });
            continue;
          }

          existing.slots.push(
            ...method.slots.map((slot) => {
              const tags = new Set<string>();
              if (slot.subsection?.trim()) tags.add(slot.subsection.trim());
              if (areaSubsection?.trim()) tags.add(areaSubsection.trim());
              return {
                ...slot,
                subsections: tags.size ? Array.from(tags) : undefined,
              };
            })
          );
        }
      }

      const table = sortEncounterMethods(Array.from(mergedByMethod.values()));
      if (reqSeq !== encounterTableReqSeqRef.current) return;
      setEncounterTable(table);
      setActiveMethod(table[0]?.method ?? "");
    } catch (e: any) {
      if (controller.signal.aborted || reqSeq !== encounterTableReqSeqRef.current) return;
      setEncounterTable([]);
      setActiveMethod("");
      setEncLoadError(e?.message ?? String(e));
    } finally {
      if (reqSeq === encounterTableReqSeqRef.current) {
        setEncLoading(false);
      }
    }
  }

  useEffect(() => {
    loadState();
    loadEncounters();
    loadFamilies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("ready", () => {});
    es.addEventListener("update", () => {
      loadState();
      loadEncounters();
      loadFamilies();
    });
    es.onerror = () => {
      es.close();
      const t = setInterval(() => {
        loadState();
        loadEncounters();
        loadFamilies();
      }, 2000);
      return () => clearInterval(t);
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const party = data?.party ?? [];
  const boxes = data?.boxes ?? [];
  const boxNames = data?.boxNames ?? [];

  const boxCount = useMemo(() => {
    const maxBox = boxes.reduce((m, b) => Math.max(m, b.box), 0);
    return boxes.length ? maxBox + 1 : 18;
  }, [boxes]);

  const activeBoxSlots = useMemo(() => {
    const slots = boxes.filter((b) => b.box === activeBox);
    slots.sort((a, b) => a.slot - b.slot);
    return slots;
  }, [boxes, activeBox]);

  const selectedPokemon: Pokemon | null = useMemo(() => {
    if (!selected) return null;

    if (selected.source === "party") {
      const p = party[selected.index];
      return p && !p.isEmpty ? p : null;
    }

    return boxDetails && !boxDetails.isEmpty ? boxDetails : null;
  }, [selected, party, boxDetails]);

  const selectedNameForAnim = useMemo(() => {
    return selectedPokemon?.speciesName ?? selected?.speciesName ?? null;
  }, [selectedPokemon, selected]);

  const activeBoxName = useMemo(() => {
    const fromBackend = boxNames[activeBox];
    if (fromBackend && fromBackend.trim()) return fromBackend;
    return `Box ${activeBox + 1}`;
  }, [boxNames, activeBox]);

  function selectParty(idx: number) {
    const p = party[idx];
    setBoxDetails(null);
    if (!p || p.isEmpty) {
      setSelected({ source: "party", index: idx, dex: 0 });
      return;
    }
    setSelected({
      source: "party",
      index: idx,
      dex: p.species,
      speciesName: p.speciesName ?? p.nickname ?? null,
    });
  }

  async function selectBoxSlot(idxWithinBox: number) {
    const s = activeBoxSlots[idxWithinBox];
    setSelected({
      source: "box",
      index: idxWithinBox,
      dex: s?.species ?? 0,
      speciesName: s?.speciesName ?? s?.nickname ?? null,
    });

    if (!s || s.isEmpty) {
      setBoxDetails(null);
      return;
    }

    setBoxDetails(null);
    try {
      const res = await fetch(`/api/box/${activeBox}/${idxWithinBox}`);
      if (!res.ok) throw new Error(await res.text());
      const full: Pokemon = await res.json();
      setBoxDetails(full);
    } catch (e) {
      console.error(e);
      setBoxDetails(null);
    }
  }

  function boxPrev() {
    setActiveBox((b) => (b - 1 + boxCount) % boxCount);
    setSelected(null);
    setBoxDetails(null);
  }

  function boxNext() {
    setActiveBox((b) => (b + 1) % boxCount);
    setSelected(null);
    setBoxDetails(null);
  }

  const natureEffect = useMemo(() => {
    const n = selectedPokemon?.natureName;
    if (!n) return null;
    return NATURE_EFFECTS[n] ?? null;
  }, [selectedPokemon?.natureName]);

  const displayTypeNames = useMemo(() => {
    const fromNames = selectedPokemon?.typeNames?.filter((t): t is string => Boolean(t?.trim())) ?? [];
    if (fromNames.length) return fromNames;

    const fromIds = (selectedPokemon?.types ?? [])
      .filter((id): id is number => typeof id === "number" && id > 0)
      .map((id) => TYPE_ID_TO_NAME[id] ?? `Type ${id}`);

    if (fromIds.length) return Array.from(new Set(fromIds));

    const species = selectedPokemon?.species ?? 0;
    if (species > 0 && speciesTypeCache[species]?.length) {
      return speciesTypeCache[species];
    }

    // de-dup in case type2 equals type1
    return Array.from(new Set(fromIds));
  }, [selectedPokemon?.typeNames, selectedPokemon?.types, selectedPokemon?.species, speciesTypeCache]);

  useEffect(() => {
    const species = selectedPokemon?.species ?? 0;
    if (species <= 0) return;

    const hasBackendNames = (selectedPokemon?.typeNames?.filter((t): t is string => Boolean(t?.trim())) ?? []).length > 0;
    const hasBackendIds = (selectedPokemon?.types?.filter((id): id is number => typeof id === "number" && id > 0) ?? []).length > 0;
    if (hasBackendNames || hasBackendIds) return;
    if (speciesTypeCache[species]?.length) return;

    const controller = new AbortController();
    fetch(`https://pokeapi.co/api/v2/pokemon/${species}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.types || !Array.isArray(j.types)) return;
        const names = j.types
          .sort((a: any, b: any) => (a.slot ?? 99) - (b.slot ?? 99))
          .map((t: any) => {
            const name = String(t?.type?.name ?? "").trim();
            if (!name) return null;
            return name.charAt(0).toUpperCase() + name.slice(1);
          })
          .filter((x: string | null): x is string => Boolean(x));

        if (!names.length) return;
        setSpeciesTypeCache((prev) => ({ ...prev, [species]: names }));
      })
      .catch(() => {
        // ignore type fetch failures
      });

    return () => controller.abort();
  }, [selectedPokemon?.species, selectedPokemon?.typeNames, selectedPokemon?.types, speciesTypeCache]);

  const resolveEncounterArea = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of encounters) {
      byKey.set(normalizeAreaKey(row.area), row.area);
    }

    const findCanonical = (candidate: string) => byKey.get(normalizeAreaKey(candidate)) ?? null;

    return (rawLocation?: string | null): string | null => {
      if (!rawLocation) return null;

      const location = rawLocation.trim();
      if (!location) return null;

      const exact = findCanonical(location);
      if (exact) return exact;

      const routeMatch = location.match(/^Route\s+(\d{3})\b/i);
      if (routeMatch) {
        const route = findCanonical(`Route ${routeMatch[1]}`);
        if (route) return route;
      }

      const aliasMatchers: Array<[RegExp, string]> = [
        [/^Oreburgh Gate\b/i, "Oreburgh Gate"],
        [/^Oreburgh Mine\b/i, "Oreburgh Mine"],
        [/^Mt\.?\s*Coronet\b/i, "Mt. Coronet"],
        [/^Great Marsh\b/i, "Great Marsh"],
        [/^Solaceon Ruins\b/i, "Solaceon Ruins"],
        [/^Iron Island\b/i, "Iron Island"],
        [/^Victory Road\b/i, "Victory Road"],
        [/^Petalburg Woods\b/i, "Petalburg Woods"],
        [/^Rusturf Tunnel\b/i, "Rusturf Tunnel"],
        [/^Granite Cave\b/i, "Granite Cave 1F"],
        [/^Fiery Path\b/i, "Fiery Path"],
        [/^Meteor Falls\b/i, "Meteor Falls 1F 1R"],
        [/^Mt\.?\s*Pyre\b/i, "Mt. Pyre 1F"],
        [/^Victory Road\b/i, "Victory Road 1F"],
        [/^Safari Zone\b/i, "Safari Zone South"],
      ];

      for (const [pattern, canonical] of aliasMatchers) {
        if (pattern.test(location)) {
          const mapped = findCanonical(canonical);
          if (mapped) return mapped;
        }
      }

      const normalizedLocation = normalizeAreaKey(location);
      const prefixMatch = encounters
        .map((r) => r.area)
        .filter((area) => normalizedLocation.startsWith(normalizeAreaKey(area)))
        .sort((a, b) => b.length - a.length)[0];
      if (prefixMatch) return prefixMatch;

      return null;
    };
  }, [encounters]);

  const inferredMetArea = useMemo(
    () => resolveEncounterArea(selectedPokemon?.metLocationName ?? null),
    [resolveEncounterArea, selectedPokemon?.metLocationName]
  );

  useEffect(() => {
    if (view !== "encounters") return;
    if (selectedArea) return;
    const selectionKey = `${selected?.source ?? ""}:${selected?.index ?? -1}:${selectedPokemon?.metLocationName ?? ""}`;
    if (selectionKey === lastAutoJumpKeyRef.current) return;

    const mapped = resolveEncounterArea(selectedPokemon?.metLocationName ?? null);
    if (mapped) {
      setSelectedArea(mapped);
    }

    lastAutoJumpKeyRef.current = selectionKey;
  }, [view, selectedArea, selected?.source, selected?.index, selectedPokemon?.metLocationName, resolveEncounterArea]);

  useEffect(() => {
    if (view !== "encounters" || !selectedArea) return;
    loadEncounterTable(selectedArea, encounterTimeOfDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedArea, encounterTimeOfDay]);

  async function lockEncounterFromSelected() {
    if (!selectedPokemon) return;

    const targetArea = selectedArea || inferredMetArea;
    if (!targetArea) return;

    const body = {
      area: targetArea,
      species: selectedPokemon.species,
      speciesName: selectedPokemon.speciesName ?? selected?.speciesName ?? null,
      nickname: selectedPokemon.nickname ?? null,
    };

    const res = await fetch("/api/encounters/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      alert(await res.text());
      return;
    }

    await loadEncounters();
    await loadFamilies();
    if (selectedArea !== targetArea) setSelectedArea(targetArea);
    await loadEncounterTable(targetArea, encounterTimeOfDay);
  }

  async function unlockSelectedAreaEncounter() {
    if (!selectedArea) return;
    const unlockArea = selectedAreaRunRow?.area ?? selectedArea;

    const res = await fetch("/api/encounters/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area: unlockArea }),
    });

    if (!res.ok) {
      alert(await res.text());
      return;
    }

    await loadEncounters();
    await loadFamilies();
    await loadEncounterTable(selectedArea, encounterTimeOfDay);
  }

  async function setSelectedPokemonEncounterStatus(status: "alive" | "dead") {
    if (!selectedPokemon || !selectedEncounterAreaLabel) return;

    const isStarterArea = normalizeAreaKey(selectedEncounterAreaLabel) === STARTER_AREA_LABEL;
    if (selectedPokemonRunRow?.status !== "caught") {
      if (!isStarterArea) return;

      const lockRes = await fetch("/api/encounters/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: selectedEncounterAreaLabel,
          species: selectedPokemon.species,
          speciesName: selectedPokemon.speciesName ?? selected?.speciesName ?? null,
          nickname: selectedPokemon.nickname ?? null,
        }),
      });

      if (!lockRes.ok) {
        alert(await lockRes.text());
        return;
      }
    }

    const res = await fetch("/api/encounters/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area: selectedEncounterAreaLabel, status }),
    });

    if (!res.ok) {
      alert(await res.text());
      return;
    }

    await loadEncounters();
    await loadFamilies();
    if (view === "encounters" && selectedArea) {
      await loadEncounterTable(selectedArea, encounterTimeOfDay);
    }
  }

  async function autoImportEncounters() {
    const res = await fetch("/api/encounters/auto-import", { method: "POST" });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await loadEncounters();
    await loadFamilies();
    if (selectedArea) await loadEncounterTable(selectedArea, encounterTimeOfDay);
  }

  const caughtSpeciesSet = useMemo(() => {
    const s = new Set<number>();
    for (const r of encounters) {
      if (r.status === "caught" && r.species) s.add(r.species);
    }
    return s;
  }, [encounters]);

  const areaGroups = useMemo(() => {
    const grouped = new Map<string, { label: string; canonicalArea: string; areas: string[] }>();

    for (const row of encounters) {
      if (normalizeAreaKey(row.area) === STARTER_AREA_LABEL) continue;
      const label = getCondensedAreaName(row.area);
      const key = normalizeAreaKey(label);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { label, canonicalArea: row.area, areas: [row.area] });
      } else {
        existing.areas.push(row.area);
      }
    }

    return Array.from(grouped.values());
  }, [encounters]);
  const areaGroupByArea = useMemo(() => {
    const map = new Map<string, { label: string; canonicalArea: string; areas: string[] }>();
    for (const group of areaGroups) {
      for (const area of group.areas) {
        map.set(area, group);
      }
    }
    return map;
  }, [areaGroups]);

  const filteredAreas = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    const list = areaGroups;
    if (!q) return list;
    return list.filter((a) => a.label.toLowerCase().includes(q));
  }, [areaGroups, routeSearch]);
  const selectedAreaCondensed = useMemo(() => getCondensedAreaName(selectedArea), [selectedArea]);

  const caughtFamilyCount = useMemo(() => {
  return caughtFamilies.length;
}, [caughtFamilies]);

  const selectedAreaRunRow = useMemo(() => {
    if (!selectedArea) return null;
    const groupAreas = areaGroupByArea.get(selectedArea)?.areas ?? [selectedArea];
    const caught = encounters.find((r) => groupAreas.includes(r.area) && r.status === "caught");
    if (caught) return caught;
    return encounters.find((r) => r.area === selectedArea) ?? null;
  }, [encounters, selectedArea, areaGroupByArea]);

  const selectedEncounterAreaLabel = useMemo(() => {
    const species = selectedPokemon?.species ?? 0;
    if (starterSpecies.has(species)) return STARTER_AREA_LABEL;
    return inferredMetArea;
  }, [inferredMetArea, selectedPokemon?.species]);

  const selectedPokemonRunRow = useMemo(() => {
    if (!selectedPokemon || !selectedEncounterAreaLabel) return null;
    const key = selectedEncounterAreaLabel.toLowerCase();
    return encounters.find((r) => r.area.toLowerCase() === key) ?? null;
  }, [encounters, selectedEncounterAreaLabel, selectedPokemon]);

  const selectedPokemonEncounterStatus = useMemo(() => {
    if (!selectedPokemonRunRow || selectedPokemonRunRow.status !== "caught") return null;
    const s = (selectedPokemonRunRow.entryStatus ?? "alive").toLowerCase();
    return s === "dead" ? "dead" : "alive";
  }, [selectedPokemonRunRow]);

  const encounterStatusByArea = useMemo(() => {
    const map = new Map<string, "alive" | "dead">();
    for (const row of encounters) {
      if (row.status !== "caught") continue;
      const status = (row.entryStatus ?? "alive").toLowerCase() === "dead" ? "dead" : "alive";
      map.set(normalizeAreaKey(row.area), status);
    }
    return map;
  }, [encounters]);

  function getEncounterAreaLabelFor(species: number, metLocationName?: string | null) {
    if (starterSpecies.has(species)) return STARTER_AREA_LABEL;
    return resolveEncounterArea(metLocationName ?? null);
  }

  function getPokemonRunStatus(species: number, metLocationName?: string | null): "alive" | "dead" | null {
    const area = getEncounterAreaLabelFor(species, metLocationName);
    if (!area) return null;
    return encounterStatusByArea.get(normalizeAreaKey(area)) ?? null;
  }

  const visibleMethod = useMemo(
    () => encounterTable.find((m) => m.method === activeMethod) ?? null,
    [encounterTable, activeMethod]
  );
  const encounterTableAggregated = useMemo(
    () =>
      encounterTable.map((m) => ({
        ...m,
        slots: aggregateEncounterSlots(m.slots),
      })),
    [encounterTable]
  );
  const visibleSlots = useMemo(
    () => aggregateEncounterSlots((visibleMethod?.slots ?? []).filter((slot) => slot.species > 0)),
    [visibleMethod]
  );
  const hasLoadedSave = Boolean(data?.trainer && Array.isArray(data?.party));

  if (!hasLoadedSave) {
    return (
      <div className="page emptyStatePage">
        <main className="emptyStateCard">
          <div className="emptyStateTitle">Load Pokemon Save</div>
          <div className="emptyStateText">Use your actual save file path. This app will watch that file directly.</div>

          <div className="savePathControls">
            <input
              className="savePathInput"
              placeholder="Paste full save path (e.g. D:\\pokemon saves\\Pokemon - Emerald Version.sav)"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void watchSavePath();
              }}
            />
            <button className="navBtn" onClick={() => void watchSavePath()} disabled={isWatchingSave}>
              {isWatchingSave ? "Loading..." : "Load Save"}
            </button>
            <button className="navBtn" onClick={() => void browseSavePath()} disabled={isBrowsingSave || isWatchingSave}>
              {isBrowsingSave ? "Browsing..." : "Browse..."}
            </button>
          </div>

          {error ? <div className="error inlineError"><strong>Error:</strong> {error}</div> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="title">{gameMode === "platinum" ? "Platinum Nuzlocke Tool" : "Emerald Nuzlocke Tool"}</div>

        <div className="right">
          <div className="tabs">
            <button className={`tab ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
              Dashboard
            </button>
            <button className={`tab ${view === "encounters" ? "active" : ""}`} onClick={() => setView("encounters")}>
              Encounters
            </button>
            <button className={`tab ${view === "battle" ? "active" : ""}`} onClick={() => setView("battle")}>
              Battle Sim
            </button>
          </div>

          <div className="meta">
            <div className="savePathControls">
              <input
                className="savePathInput"
                placeholder="Paste full save path (e.g. D:\\pokemon saves\\Pokemon - Emerald Version.sav)"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void watchSavePath();
                }}
              />
              <button className="navBtn" onClick={() => void watchSavePath()} disabled={isWatchingSave}>
                {isWatchingSave ? "Loading..." : "Load Save"}
              </button>
              <button className="navBtn" onClick={() => void browseSavePath()} disabled={isBrowsingSave || isWatchingSave}>
                {isBrowsingSave ? "Browsing..." : "Browse..."}
              </button>
            </div>
            {data?.trainer?.name ? (
              <>
                <span className="pill">OT: {data.trainer.name}</span>
                {data.updatedAt && <span className="pill">Updated: {new Date(data.updatedAt).toLocaleTimeString()}</span>}
                {data.file?.path && <span className="pill path">{data.file.path}</span>}
              </>
            ) : (
              <span className="pill">No save loaded yet</span>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {view === "dashboard" ? (
        <main className="grid">
          <section className="panel">
            <div className="panelTitle">Party</div>
            <div className="party">
              {Array.from({ length: 6 }).map((_, i) => {
                const p = party[i];
                const empty = !p || p.isEmpty;
                const dex = empty ? 0 : p.species;
                const isDead = !empty && getPokemonRunStatus(p.species, p.metLocationName) === "dead";

                return (
                  <button
                    key={i}
                    className={`slot ${selected?.source === "party" && selected.index === i ? "selected" : ""} ${isDead ? "dead" : ""}`}
                    onClick={() => selectParty(i)}
                    title={empty ? "Empty" : `${p.nickname ?? "Pokemon"} (Dex ${dex})`}
                  >
                    <div className="spriteWrap">
                      {!empty ? <DexSprite className="sprite" dex={dex} alt="" gameMode={gameMode} /> : <div className="sprite empty" />}
                    </div>
                    <div className="slotText">
                      <div className="line1">{empty ? "—" : p.nickname ?? p.speciesName ?? `#${dex}`}</div>
                      <div className="line2">{empty ? "" : `Lv ${p.level ?? "?"}${isDead ? " • DEAD" : ""}`}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel wide">
            <div className="panelTitle row">
              <span>Box</span>
              <div className="boxNav">
                <button className="navBtn" onClick={boxPrev} title="Previous box">◀</button>
                <div className="boxName">{activeBoxName}</div>
                <button className="navBtn" onClick={boxNext} title="Next box">▶</button>
              </div>
            </div>

            <div className="boxGrid">
              {Array.from({ length: 30 }).map((_, idx) => {
                const s = activeBoxSlots[idx];
                const empty = !s || s.isEmpty;
                const dex = empty ? 0 : s.species;
                const isDead = !empty && getPokemonRunStatus(s.species, s.metLocationName) === "dead";

                return (
                  <button
                    key={idx}
                    className={`boxCell ${selected?.source === "box" && selected.index === idx ? "selected" : ""} ${isDead ? "dead" : ""}`}
                    onClick={() => selectBoxSlot(idx)}
                    title={empty ? "Empty" : `${s.nickname ?? s.speciesName ?? `Dex ${dex}`} (slot ${idx + 1})`}
                  >
                    {!empty ? <DexSprite className="sprite" dex={dex} alt="" gameMode={gameMode} /> : <div className="sprite empty" />}
                    {!empty && <div className="cellLevel">{s.level ? `Lv ${s.level}` : ""}</div>}
                    {!empty && isDead && <div className="deadTag">DEAD</div>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">Stat Screen</div>

            {!selectedPokemon ? (
              <div className="statsEmpty">Click a Pokémon in Party or Box.</div>
            ) : (
              <div className="stats">
                <div className="statsHeader">
                  <div className="model">
                    {selectedNameForAnim ? (
                      <img
                        className="modelImg"
                        src={XY_ANIM_BY_NAME(selectedNameForAnim)}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_SPRITE(selectedPokemon.species);
                        }}
                      />
                    ) : (
                      <DexSprite className="modelImg" dex={selectedPokemon.species} alt="" gameMode={gameMode} />
                    )}
                  </div>
                  <div className="identity">
                    <div className="nameRow">
                      <div className="name">{selectedPokemon.nickname ?? selectedPokemon.speciesName ?? `#${selectedPokemon.species}`}</div>
                      <GenderBadge gender={selectedPokemon.gender} />
                      {selectedPokemonEncounterStatus === "dead" ? <span className="deadTag inline">DEAD</span> : null}
                      {selectedPokemon.shiny ? <span className="shiny">★</span> : null}
                    </div>
                    <div className="subRow">Lv {selectedPokemon.level ?? "?"}</div>
                    <div className="subRow">
                      {displayTypeNames.length ? (
                        <span className="typeRow">
                          <span className="pill">Type:</span>
                          <span className="typeBadges">
                            {displayTypeNames.map((t, i, arr) => (
                                <span key={`${t}:${i}`} className="typeBadgeWrap">
                                  <span className="typeBadge" style={{ backgroundColor: typeColor(t) }}>
                                    {t}
                                  </span>
                                  {i < arr.length - 1 ? <span className="typeSep">/</span> : null}
                                </span>
                              ))}
                          </span>
                        </span>
                      ) : (
                        <span className="pill">Type: —</span>
                      )}
                    </div>
                    <div className="subRow">
                      {selectedPokemon.metLocationName ? <span className="pill">Met: {selectedPokemon.metLocationName}</span> : <span className="pill">Met: —</span>}
                    </div>
                  </div>
                </div>

                <div className="infoGrid">
                  <div className="infoCard">
                    <div className="infoLabel">Ability</div>
                    <div className="infoValue">{selectedPokemon.abilityName ?? (selectedPokemon.ability ?? "—")}</div>
                  </div>
                  <div className="infoCard">
                    <div className="infoLabel">Nature</div>
                    <div className="infoValue">{selectedPokemon.natureName ?? (selectedPokemon.nature ?? "—")}</div>
                  </div>
                  <div className="infoCard">
                    <div className="infoLabel">Held Item</div>
                    <div className="infoValue">{selectedPokemon.heldItemName ?? (selectedPokemon.heldItem ?? "—")}</div>
                  </div>
                </div>

                <div className="block">
                  <div className="blockTitle">Nuzlocke Status</div>
                  {selectedPokemonRunRow?.status === "caught" || selectedEncounterAreaLabel === STARTER_AREA_LABEL ? (
                    <>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        Encounter area: <b>{selectedEncounterAreaLabel ?? "—"}</b> | Status: <b>{selectedPokemonEncounterStatus ?? "alive"}</b>
                      </div>
                      <div className="statusActions">
                        <button
                          className="navBtn"
                          disabled={selectedPokemonEncounterStatus === "dead"}
                          onClick={() => setSelectedPokemonEncounterStatus("dead")}
                          title="Mark this encounter as dead"
                        >
                          Mark Dead
                        </button>
                        <button
                          className="navBtn"
                          disabled={selectedPokemonEncounterStatus !== "dead"}
                          onClick={() => setSelectedPokemonEncounterStatus("alive")}
                          title="Revive this encounter if marked by mistake"
                        >
                          Revive
                        </button>
                      </div>
                    </>
                  ) : selectedEncounterAreaLabel ? (
                    <div className="hint">
                      Encounter area: <b>{selectedEncounterAreaLabel}</b>. This Pokemon is not mapped to a locked encounter yet.
                    </div>
                  ) : (
                    <div className="hint">This Pokemon is not mapped to a locked encounter yet.</div>
                  )}
                </div>

                <div className="block">
                  <div className="blockTitle">Stats</div>
                  {selectedPokemon.stats || selectedPokemon.ivs ? (
                    <div className="statsTable">
                      {([
                        ["HP", "hp"],
                        ["ATK", "atk"],
                        ["DEF", "def"],
                        ["SpA", "spa"],
                        ["SpD", "spd"],
                        ["SPE", "spe"],
                      ] as const).map(([label, key]) => (
                        <div className="statRow" key={key}>
                          <div className="statName">
                            {label}
                            {natureEffect?.up === key && <StatArrow dir="up" />}
                            {natureEffect?.down === key && <StatArrow dir="down" />}
                          </div>
                          <div className="statVal">IV {selectedPokemon.ivs?.[key] ?? "â€”"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="hint">Box Pokémon need the details endpoint (you already added /api/box/{`{box}`}/{`{slot}`}).</div>
                  )}
                </div>

                <div className="block">
                  <div className="blockTitle">Moves</div>
                  {selectedPokemon.moves ? (
                    <ul className="moves">
                      {selectedPokemon.moves.map((m, i) => (
                        <li key={i}>{selectedPokemon.moveNames?.[i] ?? (m ? `Move #${m}` : "—")}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="hint">Moves are available for party Pokémon; box is loaded via details endpoint.</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      ) : view === "encounters" ? (
        // ---- Encounters page starts here ----
        <main className="enc2">
          <aside className="enc2Sidebar panel">
            <div className="panelTitle">Routes / Areas</div>

            <input
              className="enc2Search"
              placeholder="Search…"
              value={routeSearch}
              onChange={(e) => setRouteSearch(e.target.value)}
            />

            <div className="enc2RouteList">
              {filteredAreas.map((group) => {
                const rows = encounters.filter((r) => group.areas.includes(r.area));
                const caughtRow = rows.find((r) => r.status === "caught") ?? null;
                const isCaught = Boolean(caughtRow);
                const caughtLabel = caughtRow?.nickname || caughtRow?.speciesName || (caughtRow?.species ? `#${caughtRow.species}` : "Caught");
                const isActive = normalizeAreaKey(group.label) === normalizeAreaKey(selectedAreaCondensed);

                return (
                  <button
                    key={group.label}
                    className={`enc2RouteItem ${isActive ? "active" : ""} ${isCaught ? "caught" : ""}`}
                    onClick={() => setSelectedArea(group.canonicalArea)}
                    title={isCaught ? `Caught: ${caughtRow?.nickname || caughtRow?.speciesName || caughtRow?.species}` : "No encounter locked"}
                  >
                    <div className="enc2RouteName">{group.label}</div>
                    <div className="enc2RouteMeta">{isCaught ? caughtLabel : "—"}</div>
                  </button>
                );
              })}
            </div>

            <div className="enc2SidebarActions">
              <div className="pill" style={{ marginBottom: 10 }}>
                 Caught families: {caughtFamilyCount}
             </div>

            <button className="navBtn" onClick={autoImportEncounters} title="Scan party + boxes and lock areas automatically (where possible)">
                Auto Import From Save
              </button>
            </div>
          </aside>

          <section className="enc2Main panel">
            <div className="panelTitle row">
              <div className="enc2HeaderLeft">
                <div className="enc2AreaTitle">{selectedAreaCondensed || "Pick an area"}</div>
                {selectedAreaRunRow?.status === "caught" ? (
                  <span className="pill">Locked: {selectedAreaRunRow.nickname || selectedAreaRunRow.speciesName || `#${selectedAreaRunRow.species}`}</span>
                ) : (
                  <span className="pill">Not locked yet</span>
                )}
              </div>

              <div className="enc2HeaderRight">
                <select
                  className="enc2TodSelect"
                  value={encounterTimeOfDay}
                  onChange={(e) => setEncounterTimeOfDay(e.target.value as EncounterTimeOfDay)}
                >
                  {gameMode === "platinum" ? <option value="morning">Morning</option> : null}
                  <option value="day">Day</option>
                  {gameMode === "platinum" ? <option value="night">Night</option> : null}
                </select>
                <button className="navBtn" disabled={!selectedPokemon || (!selectedArea && !inferredMetArea)} onClick={lockEncounterFromSelected}>
                  Lock from Selected
                </button>
                {selectedAreaRunRow?.status === "caught" ? (
                  <button className="navBtn" onClick={unlockSelectedAreaEncounter} title="Remove locked encounter for this area">
                    Remove Lock
                  </button>
                ) : null}
              </div>
            </div>

            {selectedPokemon?.metLocationName && inferredMetArea && inferredMetArea !== selectedPokemon.metLocationName ? (
              <div className="hint" style={{ marginBottom: 8 }}>
                Met location mapped to encounter area: <b>{inferredMetArea}</b>
              </div>
            ) : null}

            <div className="enc2Methods">
              {encounterTableAggregated.filter((m) => m.slots.length).map((m) => (
                <button
                  key={m.method}
                  className={`enc2MethodTab ${activeMethod === m.method ? "active" : ""}`}
                  onClick={() => setActiveMethod(m.method)}
                >
                  {m.method} <span className="enc2Count">{m.slots.length}</span>
                </button>
              ))}

              {!encounterTableAggregated.some((m) => m.slots.length) && !encLoading && !encLoadError && (
                <div className="hint">no encounters available</div>
              )}
            </div>

            {encLoading ? <div className="hint">Loading encounters…</div> : null}
            {encLoadError ? <div className="hint">{encLoadError}</div> : null}

            <div className="enc2MonWrap">
              {visibleSlots.map((slot, idx) => {
              const isCaughtSpecies = caughtSpeciesSet.has(slot.species);
              const isCaughtFamily = slot.isDupes;
              const grey = isCaughtSpecies || isCaughtFamily;

              return (
                <div
                  key={`${selectedArea}:${encounterTimeOfDay}:${activeMethod}:${slot.species}:${slot.minLevel}:${slot.maxLevel}:${(slot.subsections ?? []).join("|")}:${idx}`}
                  className={`enc2Mon ${grey ? "grey" : ""}`}
                >
                  <DexSprite className="enc2Sprite" dex={slot.species} alt="" gameMode={gameMode} />
                  <div className="enc2MonName">{slot.speciesName ?? `#${slot.species}`}</div>
                  <div className="enc2MonLv">
                    <span>{fmtLevelRange(slot.minLevel, slot.maxLevel)}</span>
                    {(slot.subsections ?? []).length ? <span className="enc2FloorMarker">{slot.subsections?.join(", ")}</span> : null}
                  </div>

                  {typeof slot.rate === "number" && !grey ? (
                    <div className="enc2Tag">{slot.rate}%</div>
                  ) : isCaughtSpecies ? (
                    <div className="enc2Tag">Caught species</div>
                  ) : isCaughtFamily ? (
                    <div className="enc2Tag">Caught family</div>
                  ) : typeof slot.rate === "number" ? (
                    <div className="enc2Tag">{slot.rate}%</div>
                  ) : null}
                </div>
              );
})}
            </div>

            <div className="hint" style={{ marginTop: 10 }}>
              Tip: Click a Pokémon in your Dashboard first, then press <b>Lock from Selected</b>. If that Pokémon has a <code>metLocationName</code>,
              the selected route will auto-jump to it.
            </div>
          </section>
        </main>
      ) : (
        <BattleSim party={party} gameMode={gameMode} />
      )}
    </div>
  );
}


