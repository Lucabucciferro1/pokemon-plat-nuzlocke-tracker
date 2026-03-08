import fs from 'node:fs';

const areaList = fs.readFileSync('.tools/emerald_areas.txt', 'utf8');

function patchFile(file, fn) {
  const orig = fs.readFileSync(file, 'utf8');
  const next = fn(orig);
  if (next !== orig) fs.writeFileSync(file, next);
}

patchFile('backend/run/EncounterService.cs', (t) => {
  t = t.replace(/Path\.Combine\(AppContext\.BaseDirectory, "encounters_platinum\.json"\),\s*\n\s*Path\.Combine\(AppContext\.BaseDirectory, "run", "encounters_platinum\.json"\)/, 'Path.Combine(AppContext.BaseDirectory, "encounters_emerald.json"),\n            Path.Combine(AppContext.BaseDirectory, "run", "encounters_emerald.json")');
  t = t.replace(/public static readonly string\[] Areas =\s*\{[\s\S]*?\n\s*\};/, `public static readonly string[] Areas =\n    {\n        ${areaList}\n    };`);
  return t;
});

patchFile('backend/Program.cs', (t) => {
  t = t.replace(/D:\/plat save\/Pokemon - Platinum Version \(Europe\)\.sav/g, 'D:/emerald save/Pokemon - Emerald Version.sav');
  t = t.replace(/battles_platinum\.json/g, 'battles_emerald.json');
  t = t.replace('name = "Platinum Nuzlocke Tool Backend"', 'name = "Emerald Nuzlocke Tool Backend"');
  t = t.replace(/var starterSpecies = new HashSet<int>\s*\{[\s\S]*?\};/, `var starterSpecies = new HashSet<int>\n    {\n        252, 253, 254, // Treecko line\n        255, 256, 257, // Torchic line\n        258, 259, 260  // Mudkip line\n    };`);
  return t;
});

patchFile('backend/backend.csproj', (t) => {
  t = t.replace(/run\\encounters_platinum\.json/g, 'run\\encounters_emerald.json');
  t = t.replace(/run\\battles_platinum\.json/g, 'run\\battles_emerald.json');
  return t;
});

patchFile('frontend/src/App.tsx', (t) => {
  t = t.replace('type EncounterTimeOfDay = "morning" | "day" | "night";', 'type EncounterTimeOfDay = "day";');
  t = t.replace(/const GEN4_PLAT_SPRITE = \(dex: number\) =>\s*\n\s*`https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-iv\/platinum\/\$\{dex\}\.png`;/, 'const GEN3_EMERALD_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${dex}.png`;');
  t = t.replace(/const GEN5_SPRITE = \(dex: number\) =>\s*\n\s*`https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-v\/black-white\/\$\{dex\}\.png`;/, 'const GEN3_FRLG_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/${dex}.png`;\nconst GEN5_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${dex}.png`;');
  t = t.replace('const STARTER_SPECIES = new Set<number>([\n  387, 388, 389, // Turtwig line\n  390, 391, 392, // Chimchar line\n  393, 394, 395, // Piplup line\n]);', 'const STARTER_SPECIES = new Set<number>([\n  252, 253, 254, // Treecko line\n  255, 256, 257, // Torchic line\n  258, 259, 260, // Mudkip line\n]);');
  t = t.replace('const STARTER_AREA_LABEL = "starter pokemon";', 'const STARTER_AREA_LABEL = "Starter Pokemon";');
  t = t.replace('const [srcIdx, setSrcIdx] = useState(0);\n  const sources = useMemo(() => [GEN4_PLAT_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)], [dex]);', 'const [srcIdx, setSrcIdx] = useState(0);\n  const sources = useMemo(() => [GEN3_EMERALD_SPRITE(dex), GEN3_FRLG_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)], [dex]);');
  t = t.replace(/Load Pokemon Platinum Save/g, 'Load Pokemon Emerald Save');
  t = t.replace(/D:\\plat save\\Pokemon - Platinum Version \(Europe\)\.sav/g, 'D:\\emerald save\\Pokemon - Emerald Version.sav');
  t = t.replace(/Platinum Nuzlocke Tool/g, 'Emerald Nuzlocke Tool');
  t = t.replace(/\s*<option value="morning">Morning<\/option>\r?\n/g, '');
  t = t.replace(/\s*<option value="night">Night<\/option>\r?\n/g, '');
  return t;
});

patchFile('frontend/src/BattleSim.tsx', (t) => {
  t = t.replace(/const GEN4_PLAT_SPRITE = \(dex: number\) =>\s*\n\s*`https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-iv\/platinum\/\$\{dex\}\.png`;/, 'const GEN3_EMERALD_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${dex}.png`;');
  t = t.replace(/const GEN5_SPRITE = \(dex: number\) =>\s*\n\s*`https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/generation-v\/black-white\/\$\{dex\}\.png`;/, 'const GEN3_FRLG_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/${dex}.png`;\nconst GEN5_SPRITE = (dex: number) =>\n  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${dex}.png`;');
  t = t.replace('const sources = useMemo(() => [GEN4_PLAT_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)], [dex]);', 'const sources = useMemo(() => [GEN3_EMERALD_SPRITE(dex), GEN3_FRLG_SPRITE(dex), GEN5_SPRITE(dex), DEFAULT_SPRITE(dex)], [dex]);');
  t = t.replace(/const STORY_AREA_ORDER_RAW = \[[\s\S]*?\];/, `const STORY_AREA_ORDER_RAW = [\n  "Route 101",\n  "Route 102",\n  "Petalburg Woods",\n  "Route 104",\n  "Rustboro Gym",\n  "Dewford Gym",\n  "Route 110",\n  "Mauville Gym",\n  "Fiery Path",\n  "Mt. Chimney",\n  "Lavaridge Gym",\n  "Petalburg Gym",\n  "Route 119",\n  "Weather Institute",\n  "Fortree Gym",\n  "Mt. Pyre",\n  "Mossdeep Space Center",\n  "Mossdeep Gym",\n  "Seafloor Cavern",\n  "Sootopolis Gym",\n  "Victory Road",\n  "Pokemon League",\n];`);
  t = t.replace(/const STORY_AREA_ALIASES: Record<string, string> = \{[\s\S]*?\};/, `const STORY_AREA_ALIASES: Record<string, string> = {\n  "mauville city gym": "Mauville Gym",\n  "rustboro city gym": "Rustboro Gym",\n  "dewford town gym": "Dewford Gym",\n  "lavaridge town gym": "Lavaridge Gym",\n  "petalburg city gym": "Petalburg Gym",\n  "fortree city gym": "Fortree Gym",\n  "mossdeep city gym": "Mossdeep Gym",\n  "sootopolis city gym": "Sootopolis Gym",\n};`);
  t = t.replace('No battles found. Add entries to run/battles_platinum.json.', 'No battles found. Add entries to run/battles_emerald.json.');
  return t;
});

patchFile('README.md', (t) => {
  t = t.replace(/Platinum Nuzlocke Tool/g, 'Emerald Nuzlocke Tool');
  t = t.replace(/Pokemon Platinum/g, 'Pokemon Emerald');
  t = t.replace(/encounters_platinum\.json/g, 'encounters_emerald.json');
  t = t.replace(/battles_platinum\.json/g, 'battles_emerald.json');
  return t;
});
