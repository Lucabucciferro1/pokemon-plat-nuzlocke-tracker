using System.Text.Json;

namespace PlatinumNuzlocke.Run;

internal sealed class EncounterService
{
    private readonly RunStateStore _store;
    private readonly object _tablesGate = new();
    private Dictionary<string, List<EncounterTableMethodDef>> _tables;
    private List<string> _areas;
    private string? _tablesPath;
    private DateTime _tablesLastWriteUtc;
    private string _gameMode;
    private static readonly JsonSerializerOptions EncounterTableJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public EncounterService(RunStateStore store)
    {
        _store = store;
        _tables = new Dictionary<string, List<EncounterTableMethodDef>>(StringComparer.OrdinalIgnoreCase);
        _areas = new List<string>();
        _gameMode = "emerald";
        ReloadTablesIfNeeded(force: true);
    }

    public void SetGameMode(string? gameMode)
    {
        var normalized = NormalizeGameMode(gameMode);
        lock (_tablesGate)
        {
            if (string.Equals(_gameMode, normalized, StringComparison.OrdinalIgnoreCase))
                return;

            _gameMode = normalized;
            _tablesPath = null;
            _tablesLastWriteUtc = DateTime.MinValue;
        }

        ReloadTablesIfNeeded(force: true);
    }

    public IReadOnlyList<string> GetAreas()
    {
        ReloadTablesIfNeeded();
        lock (_tablesGate)
            return _areas.ToArray();
    }

    private static string NormalizeGameMode(string? gameMode)
    {
        var normalized = (gameMode ?? "emerald").Trim().ToLowerInvariant();
        return normalized == "platinum" ? "platinum" : "emerald";
    }

    private string? ResolveEncounterTablePath()
    {
        var primary = _gameMode == "platinum"
            ? new[]
            {
                Path.Combine(AppContext.BaseDirectory, "encounters_platinum.json"),
                Path.Combine(AppContext.BaseDirectory, "run", "encounters_platinum.json")
            }
            : new[]
            {
                Path.Combine(AppContext.BaseDirectory, "encounters_emerald.json"),
                Path.Combine(AppContext.BaseDirectory, "run", "encounters_emerald.json")
            };

        var fallback = _gameMode == "platinum"
            ? new[]
            {
                Path.Combine(AppContext.BaseDirectory, "encounters_emerald.json"),
                Path.Combine(AppContext.BaseDirectory, "run", "encounters_emerald.json")
            }
            : new[]
            {
                Path.Combine(AppContext.BaseDirectory, "encounters_platinum.json"),
                Path.Combine(AppContext.BaseDirectory, "run", "encounters_platinum.json")
            };

        var candidates = primary.Concat(fallback);
        return candidates.FirstOrDefault(File.Exists);
    }

    private static List<string> ReadAreaOrderFromJson(string path)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
            return new List<string>();

        var areas = new List<string>();
        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            if (!string.IsNullOrWhiteSpace(prop.Name))
                areas.Add(prop.Name);
        }
        return areas;
    }

    private string? ResolveAreaOrderPath()
    {
        var fileName = _gameMode == "platinum"
            ? "encounter_area_order_platinum.txt"
            : "encounter_area_order_emerald.txt";

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, fileName),
            Path.Combine(AppContext.BaseDirectory, "run", fileName)
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static List<string> ReadPreferredAreaOrder(string path)
    {
        var result = new List<string>();
        foreach (var raw in File.ReadLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0)
                continue;

            if (line.StartsWith("Pokemon ", StringComparison.OrdinalIgnoreCase))
                continue;

            var numbered = System.Text.RegularExpressions.Regex.Match(line, @"^\d+\.\s*(.+)$");
            if (!numbered.Success)
                continue;

            var area = numbered.Groups[1].Value.Trim();
            if (area.Length > 0)
                result.Add(area);
        }

        return result;
    }

    private static string NormalizeAreaOrderKey(string area)
    {
        var withoutParen = System.Text.RegularExpressions.Regex.Replace(area, @"\s*\(.*?\)\s*$", "");
        var normalized = withoutParen
            .Trim()
            .ToLowerInvariant();
        normalized = System.Text.RegularExpressions.Regex.Replace(normalized, @"\s+", " ");
        return normalized;
    }

    private static List<string> ApplyPreferredAreaOrder(List<string> discoveredAreas, List<string> preferredOrder)
    {
        if (discoveredAreas.Count == 0 || preferredOrder.Count == 0)
            return discoveredAreas;

        var preferred = preferredOrder
            .Select(NormalizeAreaOrderKey)
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (preferred.Count == 0)
            return discoveredAreas;

        static int FindPriority(string areaKey, List<string> preferredKeys)
        {
            var exact = preferredKeys.FindIndex(p => string.Equals(p, areaKey, StringComparison.OrdinalIgnoreCase));
            if (exact >= 0) return exact;

            for (int i = 0; i < preferredKeys.Count; i++)
            {
                var pref = preferredKeys[i];
                if (areaKey.StartsWith(pref + " ", StringComparison.OrdinalIgnoreCase))
                    return i;
            }
            return int.MaxValue;
        }

        return discoveredAreas
            .Select((area, idx) => new
            {
                Area = area,
                Index = idx,
                Priority = FindPriority(NormalizeAreaOrderKey(area), preferred)
            })
            .Where(x => x.Priority != int.MaxValue)
            .OrderBy(x => x.Priority)
            .ThenBy(x => x.Index)
            .Select(x => x.Area)
            .ToList();
    }

    private void ReloadTablesIfNeeded(bool force = false)
    {
        lock (_tablesGate)
        {
            var resolvedPath = ResolveEncounterTablePath();
            if (string.IsNullOrWhiteSpace(resolvedPath) || !File.Exists(resolvedPath))
            {
                if (force || _tables.Count != 0)
                {
                    _tables = new Dictionary<string, List<EncounterTableMethodDef>>(StringComparer.OrdinalIgnoreCase);
                    _areas = new List<string>();
                    _tablesPath = null;
                    _tablesLastWriteUtc = DateTime.MinValue;
                }
                return;
            }

            var lastWriteUtc = File.GetLastWriteTimeUtc(resolvedPath);
            var pathChanged = !string.Equals(_tablesPath, resolvedPath, StringComparison.OrdinalIgnoreCase);
            var writeChanged = lastWriteUtc != _tablesLastWriteUtc;

            if (!force && !pathChanged && !writeChanged)
                return;

            var json = File.ReadAllText(resolvedPath);
            _tables = JsonSerializer.Deserialize<Dictionary<string, List<EncounterTableMethodDef>>>(json, EncounterTableJsonOptions)
                ?? new Dictionary<string, List<EncounterTableMethodDef>>(StringComparer.OrdinalIgnoreCase);
            _areas = ReadAreaOrderFromJson(resolvedPath);
            if (_areas.Count == 0)
                _areas = _tables.Keys.Where(a => !string.IsNullOrWhiteSpace(a)).ToList();
            var areaOrderPath = ResolveAreaOrderPath();
            if (!string.IsNullOrWhiteSpace(areaOrderPath))
            {
                var preferred = ReadPreferredAreaOrder(areaOrderPath);
                _areas = ApplyPreferredAreaOrder(_areas, preferred);
            }
            _tablesPath = resolvedPath;
            _tablesLastWriteUtc = lastWriteUtc;
        }
    }

    // -------------------- Existing API used by Program.cs --------------------

    private Dictionary<string, EncounterEntry> GetScopedEncounters(RunState run, bool createIfMissing)
    {
        var mode = NormalizeGameMode(_gameMode);

        if (run.EncountersByGame.TryGetValue(mode, out var existing))
            return existing;

        var scoped = BuildLegacyScopedEncounters(run);
        if (createIfMissing)
            run.EncountersByGame[mode] = scoped;
        return scoped;
    }

    private Dictionary<string, EncounterEntry> BuildLegacyScopedEncounters(RunState run)
    {
        if (run.Encounters.Count == 0)
            return new Dictionary<string, EncounterEntry>(StringComparer.OrdinalIgnoreCase);

        var currentAreas = GetAreas().ToHashSet(StringComparer.OrdinalIgnoreCase);
        var scoped = new Dictionary<string, EncounterEntry>(StringComparer.OrdinalIgnoreCase);

        foreach (var kvp in run.Encounters)
        {
            if (!currentAreas.Contains(kvp.Key))
                continue;

            scoped[kvp.Key] = kvp.Value;
        }

        return scoped;
    }

    public async Task<List<EncounterRow>> GetEncounterRowsAsync(CancellationToken ct)
    {
        var run = await _store.LoadAsync(ct);
        var encounters = GetScopedEncounters(run, createIfMissing: false);

        var rows = new List<EncounterRow>();

        foreach (var area in GetAreas())
        {
            if (encounters.TryGetValue(area, out var entry))
            {
                var familyRoot = GetFamilyRootForSpecies(entry.Species);

                rows.Add(new EncounterRow
                {
                    Area = area,
                    Status = "caught",
                    Species = entry.Species,
                    SpeciesName = entry.SpeciesName,
                    Nickname = entry.Nickname,
                    EntryStatus = entry.Status,
                    FamilyRoot = familyRoot
                });
            }
            else
            {
                rows.Add(new EncounterRow
                {
                    Area = area,
                    Status = "empty",
                    Species = null,
                    SpeciesName = null,
                    Nickname = null,
                    EntryStatus = null,
                    FamilyRoot = null
                });
            }
        }

        return rows;
    }

    public async Task LockEncounterAsync(string area, int species, string? speciesName, string? nickname, CancellationToken ct)
    {
        var run = await _store.LoadAsync(ct);
        var encounters = GetScopedEncounters(run, createIfMissing: true);

        if (encounters.ContainsKey(area))
            return; // already locked, ignore

        encounters[area] = new EncounterEntry
        {
            Species = species,
            SpeciesName = speciesName,
            Nickname = nickname,
            Status = "alive",
            CaughtAt = DateTimeOffset.UtcNow
        };

        await _store.SaveAsync(run, ct);
    }

    public async Task<bool> UnlockEncounterAsync(string area, CancellationToken ct)
    {
        var run = await _store.LoadAsync(ct);
        var encounters = GetScopedEncounters(run, createIfMissing: true);
        var removed = encounters.Remove(area);
        if (!removed)
            return false;

        await _store.SaveAsync(run, ct);
        return true;
    }

    public async Task<bool> SetEncounterStatusAsync(string area, string status, CancellationToken ct)
    {
        var run = await _store.LoadAsync(ct);
        var encounters = GetScopedEncounters(run, createIfMissing: true);
        if (!encounters.TryGetValue(area, out var entry))
            return false;

        entry.Status = status;
        await _store.SaveAsync(run, ct);
        return true;
    }

    public async Task<IEnumerable<int>> GetCaughtFamiliesAsync(CancellationToken ct)
    {
        var run = await _store.LoadAsync(ct);
        var encounters = GetScopedEncounters(run, createIfMissing: false);

        return encounters.Values
            .Select(e => GetFamilyRootForSpecies(e.Species))
            .Where(x => x > 0)
            .Distinct()
            .ToList();
    }

    // -------------------- New table API for level ranges --------------------

    public async Task<List<EncounterMethodView>> GetEncounterTableAsync(string area, string? timeOfDay, CancellationToken ct)
    {
        ReloadTablesIfNeeded();

        if (!_tables.TryGetValue(area, out var methods))
            return new List<EncounterMethodView>();

        var caughtFamilies = (await GetCaughtFamiliesAsync(ct)).ToHashSet();
        var normalizedTimeOfDay = NormalizeTimeOfDay(timeOfDay);

        var result = new List<EncounterMethodView>();

        foreach (var method in methods)
        {
            var slots = new List<EncounterSlotView>();
            var sourceSlots = ResolveSlotsForTimeOfDay(method, normalizedTimeOfDay);

            foreach (var slot in sourceSlots)
            {
                if (slot.Species <= 0)
                    continue;

                var family = slot.FamilyRoot ?? GetFamilyRootForSpecies(slot.Species);

                slots.Add(new EncounterSlotView
                {
                    Species = slot.Species,
                    SpeciesName = slot.SpeciesName,
                    MinLevel = slot.MinLevel,
                    MaxLevel = slot.MaxLevel,
                    Rate = slot.Rate,
                    Subsection = slot.Subsection,
                    IsDupes = caughtFamilies.Contains(family)
                });
            }

            result.Add(new EncounterMethodView
            {
                Method = method.Method,
                Slots = slots
            });
        }

        return result;
    }

    private static string NormalizeTimeOfDay(string? timeOfDay)
    {
        var normalized = (timeOfDay ?? "day").Trim().ToLowerInvariant();
        return normalized switch
        {
            "morning" => "morning",
            "night" => "night",
            _ => "day"
        };
    }

    private static IReadOnlyList<EncounterTableSlotDef> ResolveSlotsForTimeOfDay(EncounterTableMethodDef method, string timeOfDay)
    {
        if (method.TimeOfDaySlots is null)
            return method.Slots;

        var direct = timeOfDay switch
        {
            "morning" => method.TimeOfDaySlots.Morning,
            "night" => method.TimeOfDaySlots.Night,
            _ => method.TimeOfDaySlots.Day
        };

        if (direct is { Count: > 0 })
            return direct;

        if (timeOfDay != "day" && method.TimeOfDaySlots.Day is { Count: > 0 })
            return method.TimeOfDaySlots.Day;

        if (method.TimeOfDaySlots.Morning is { Count: > 0 })
            return method.TimeOfDaySlots.Morning;

        if (method.TimeOfDaySlots.Night is { Count: > 0 })
            return method.TimeOfDaySlots.Night;

        return method.Slots;
    }

    // -------------------- Family logic --------------------
    // For now this is intentionally simple:
    // - Use familyRoot from JSON if you want exact dupes families
    // - Otherwise species itself is treated as its own family
   private static readonly Dictionary<int, int[]> EvolutionFamilies = new()
{
    [1] = new[] { 1, 2, 3 },
    [4] = new[] { 4, 5, 6 },
    [7] = new[] { 7, 8, 9 },
    [10] = new[] { 10, 11, 12 },
    [13] = new[] { 13, 14, 15 },
    [16] = new[] { 16, 17, 18 },
    [19] = new[] { 19, 20 },
    [21] = new[] { 21, 22 },
    [23] = new[] { 23, 24 },
    [172] = new[] { 172, 25, 26 },
    [27] = new[] { 27, 28 },
    [29] = new[] { 29, 30, 31 },
    [32] = new[] { 32, 33, 34 },
    [173] = new[] { 173, 35, 36 },
    [37] = new[] { 37, 38 },
    [174] = new[] { 174, 39, 40 },
    [41] = new[] { 41, 42, 169 },
    [43] = new[] { 43, 44, 45, 182 },
    [46] = new[] { 46, 47 },
    [48] = new[] { 48, 49 },
    [50] = new[] { 50, 51 },
    [52] = new[] { 52, 53 },
    [54] = new[] { 54, 55 },
    [56] = new[] { 56, 57 },
    [58] = new[] { 58, 59 },
    [60] = new[] { 60, 61, 62, 186 },
    [63] = new[] { 63, 64, 65 },
    [66] = new[] { 66, 67, 68 },
    [69] = new[] { 69, 70, 71 },
    [72] = new[] { 72, 73 },
    [74] = new[] { 74, 75, 76 },
    [77] = new[] { 77, 78 },
    [79] = new[] { 79, 80, 199 },
    [81] = new[] { 81, 82, 462 },
    [83] = new[] { 83 },
    [84] = new[] { 84, 85 },
    [86] = new[] { 86, 87 },
    [88] = new[] { 88, 89 },
    [90] = new[] { 90, 91 },
    [92] = new[] { 92, 93, 94 },
    [95] = new[] { 95, 208 },
    [96] = new[] { 96, 97 },
    [98] = new[] { 98, 99 },
    [100] = new[] { 100, 101 },
    [102] = new[] { 102, 103 },
    [104] = new[] { 104, 105 },
    [440] = new[] { 440, 113, 242 },
    [108] = new[] { 108, 463 },
    [109] = new[] { 109, 110 },
    [111] = new[] { 111, 112, 464 },
    [114] = new[] { 114, 465 },
    [115] = new[] { 115 },
    [116] = new[] { 116, 117, 230 },
    [458] = new[] { 458, 226 },
    [118] = new[] { 118, 119 },
    [120] = new[] { 120, 121 },
    [439] = new[] { 439, 122 },
    [123] = new[] { 123, 212 },
    [238] = new[] { 238, 124 },
    [239] = new[] { 239, 125, 466 },
    [240] = new[] { 240, 126, 467 },
    [127] = new[] { 127 },
    [128] = new[] { 128 },
    [129] = new[] { 129, 130 },
    [131] = new[] { 131 },
    [132] = new[] { 132 },
    [133] = new[] { 133, 134, 135, 136, 196, 197, 470, 471 },
    [137] = new[] { 137, 233, 474 },
    [138] = new[] { 138, 139 },
    [140] = new[] { 140, 141 },
    [142] = new[] { 142 },
    [446] = new[] { 446, 143 },
    [147] = new[] { 147, 148, 149 },
    [150] = new[] { 150 },
    [151] = new[] { 151 },

    [152] = new[] { 152, 153, 154 },
    [155] = new[] { 155, 156, 157 },
    [158] = new[] { 158, 159, 160 },
    [161] = new[] { 161, 162 },
    [163] = new[] { 163, 164 },
    [165] = new[] { 165, 166 },
    [167] = new[] { 167, 168 },
    [170] = new[] { 170, 171 },
    [175] = new[] { 175, 176, 468 },
    [177] = new[] { 177, 178 },
    [179] = new[] { 179, 180, 181 },
    [298] = new[] { 298, 183, 184 },
    [438] = new[] { 438, 185 },
    [187] = new[] { 187, 188, 189 },
    [190] = new[] { 190, 424 },
    [191] = new[] { 191, 192 },
    [193] = new[] { 193, 469 },
    [194] = new[] { 194, 195 },
    [198] = new[] { 198, 430 },
    [200] = new[] { 200, 429 },
    [201] = new[] { 201 },
    [360] = new[] { 360, 202 },
    [203] = new[] { 203 },
    [204] = new[] { 204, 205 },
    [206] = new[] { 206 },
    [207] = new[] { 207, 472 },
    [209] = new[] { 209, 210 },
    [211] = new[] { 211 },
    [213] = new[] { 213 },
    [214] = new[] { 214 },
    [215] = new[] { 215, 461 },
    [216] = new[] { 216, 217 },
    [218] = new[] { 218, 219 },
    [220] = new[] { 220, 221, 473 },
    [222] = new[] { 222 },
    [223] = new[] { 223, 224 },
    [225] = new[] { 225 },
    [227] = new[] { 227 },
    [228] = new[] { 228, 229 },
    [231] = new[] { 231, 232 },
    [234] = new[] { 234 },
    [235] = new[] { 235 },
    [236] = new[] { 236, 106, 107, 237 },
    [241] = new[] { 241 },
    [243] = new[] { 243 },
    [244] = new[] { 244 },
    [245] = new[] { 245 },
    [246] = new[] { 246, 247, 248 },
    [249] = new[] { 249 },
    [250] = new[] { 250 },
    [251] = new[] { 251 },

    [252] = new[] { 252, 253, 254 },
    [255] = new[] { 255, 256, 257 },
    [258] = new[] { 258, 259, 260 },
    [261] = new[] { 261, 262 },
    [263] = new[] { 263, 264 },
    [265] = new[] { 265, 266, 267, 268, 269 },
    [270] = new[] { 270, 271, 272 },
    [273] = new[] { 273, 274, 275 },
    [276] = new[] { 276, 277 },
    [278] = new[] { 278, 279 },
    [280] = new[] { 280, 281, 282, 475 },
    [283] = new[] { 283, 284 },
    [285] = new[] { 285, 286 },
    [287] = new[] { 287, 288, 289 },
    [290] = new[] { 290, 291, 292 },
    [293] = new[] { 293, 294, 295 },
    [296] = new[] { 296, 297 },
    [299] = new[] { 299, 476 },
    [300] = new[] { 300, 301 },
    [302] = new[] { 302 },
    [303] = new[] { 303 },
    [304] = new[] { 304, 305, 306 },
    [307] = new[] { 307, 308 },
    [309] = new[] { 309, 310 },
    [311] = new[] { 311 },
    [312] = new[] { 312 },
    [313] = new[] { 313 },
    [314] = new[] { 314 },
    [406] = new[] { 406, 315, 407 },
    [316] = new[] { 316, 317 },
    [318] = new[] { 318, 319 },
    [320] = new[] { 320, 321 },
    [322] = new[] { 322, 323 },
    [324] = new[] { 324 },
    [325] = new[] { 325, 326 },
    [327] = new[] { 327 },
    [328] = new[] { 328, 329, 330 },
    [331] = new[] { 331, 332 },
    [333] = new[] { 333, 334 },
    [335] = new[] { 335 },
    [336] = new[] { 336 },
    [337] = new[] { 337 },
    [338] = new[] { 338 },
    [339] = new[] { 339, 340 },
    [341] = new[] { 341, 342 },
    [343] = new[] { 343, 344 },
    [345] = new[] { 345, 346 },
    [347] = new[] { 347, 348 },
    [349] = new[] { 349, 350 },
    [351] = new[] { 351 },
    [353] = new[] { 353, 354, 477 },
    [433] = new[] { 433, 358 },
    [359] = new[] { 359 },
    [361] = new[] { 361, 362, 478 },
    [363] = new[] { 363, 364, 365 },
    [366] = new[] { 366, 367, 368 },
    [369] = new[] { 369 },
    [370] = new[] { 370 },
    [371] = new[] { 371, 372, 373 },
    [374] = new[] { 374, 375, 376 },
    [377] = new[] { 377 },
    [378] = new[] { 378 },
    [379] = new[] { 379 },
    [380] = new[] { 380 },
    [381] = new[] { 381 },
    [382] = new[] { 382 },
    [383] = new[] { 383 },
    [384] = new[] { 384 },
    [385] = new[] { 385 },
    [386] = new[] { 386 },

    [387] = new[] { 387, 388, 389 },
    [390] = new[] { 390, 391, 392 },
    [393] = new[] { 393, 394, 395 },
    [396] = new[] { 396, 397, 398 },
    [399] = new[] { 399, 400 },
    [401] = new[] { 401, 402 },
    [403] = new[] { 403, 404, 405 },
    [408] = new[] { 408, 409 },
    [410] = new[] { 410, 411 },
    [412] = new[] { 412, 413, 414 },
    [415] = new[] { 415, 416 },
    [417] = new[] { 417 },
    [418] = new[] { 418, 419 },
    [420] = new[] { 420, 421 },
    [422] = new[] { 422, 423 },
    [425] = new[] { 425, 426 },
    [427] = new[] { 427, 428 },
    [431] = new[] { 431, 432 },
    [434] = new[] { 434, 435 },
    [436] = new[] { 436, 437 },
    [441] = new[] { 441 },
    [442] = new[] { 442 },
    [443] = new[] { 443, 444, 445 },
    [447] = new[] { 447, 448 },
    [449] = new[] { 449, 450 },
    [451] = new[] { 451, 452 },
    [453] = new[] { 453, 454 },
    [455] = new[] { 455 },
    [456] = new[] { 456, 457 },
    [459] = new[] { 459, 460 },
    [479] = new[] { 479 },
    [480] = new[] { 480 },
    [481] = new[] { 481 },
    [482] = new[] { 482 },
    [483] = new[] { 483 },
    [484] = new[] { 484 },
    [485] = new[] { 485 },
    [486] = new[] { 486 },
    [487] = new[] { 487 },
    [488] = new[] { 488 },
    [489] = new[] { 489, 490 },
    [491] = new[] { 491 },
    [492] = new[] { 492 },
    [493] = new[] { 493 }
};

private static readonly Dictionary<int, int> FamilyRootBySpecies = BuildFamilyRootBySpecies();

private static Dictionary<int, int> BuildFamilyRootBySpecies()
{
    var map = new Dictionary<int, int>();

    foreach (var family in EvolutionFamilies)
    {
        var root = family.Key;
        foreach (var species in family.Value)
        {
            map[species] = root;
        }
    }

    return map;
}

private static int GetFamilyRootForSpecies(int species)
{
    return FamilyRootBySpecies.TryGetValue(species, out var root)
        ? root
        : species;
}
}

// -------------------- Run-state row returned to frontend --------------------

internal sealed class EncounterRow
{
    public string Area { get; set; } = "";
    public string Status { get; set; } = "empty"; // "empty" | "caught"
    public int? Species { get; set; }
    public string? SpeciesName { get; set; }
    public string? Nickname { get; set; }
    public string? EntryStatus { get; set; } // "alive", etc.
    public int? FamilyRoot { get; set; }
}

// -------------------- Encounter table models loaded from JSON --------------------

internal sealed class EncounterTableMethodDef
{
    public string Method { get; set; } = "";
    public List<EncounterTableSlotDef> Slots { get; set; } = new();
    public EncounterTimeOfDaySlotsDef? TimeOfDaySlots { get; set; }
}

internal sealed class EncounterTimeOfDaySlotsDef
{
    public List<EncounterTableSlotDef>? Morning { get; set; }
    public List<EncounterTableSlotDef>? Day { get; set; }
    public List<EncounterTableSlotDef>? Night { get; set; }
}

internal sealed class EncounterTableSlotDef
{
    public int Species { get; set; }
    public string? SpeciesName { get; set; }
    public int MinLevel { get; set; }
    public int MaxLevel { get; set; }
    public int? Rate { get; set; }
    public string? Subsection { get; set; }

    // optional in JSON if you want to define evolution-family dupes manually
    public int? FamilyRoot { get; set; }
}

// -------------------- Table response returned to frontend --------------------

internal sealed class EncounterMethodView
{
    public string Method { get; set; } = "";
    public List<EncounterSlotView> Slots { get; set; } = new();
}

internal sealed class EncounterSlotView
{
    public int Species { get; set; }
    public string? SpeciesName { get; set; }
    public int MinLevel { get; set; }
    public int MaxLevel { get; set; }
    public int? Rate { get; set; }
    public string? Subsection { get; set; }
    public bool IsDupes { get; set; }
}
