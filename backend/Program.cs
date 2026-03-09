// Program.cs
// .NET 10 + PKHeX.Core 26.1.31
//
// Endpoints:
//  POST /api/watch   { "path": "D:/emerald save/Pokemon - Emerald Version.sav" }
//  GET  /api/state   -> latest parsed snapshot (trainer + party + boxes)
//  GET  /api/stream  -> Server-Sent Events (push updates on file change)
//
// Name resolution:
// - Uses PokeAPI (pokeapi.co) to convert IDs -> English names
// - Caches results to ./namecache.json so it becomes effectively offline after first run

using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;
using PKHeX.Core;
using PlatinumNuzlocke.Run;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p =>
        p.AllowAnyHeader()
         .AllowAnyMethod()
         .AllowAnyOrigin());
});

builder.Services.AddSingleton<NameCache>(); // <-- cache service
builder.Services.AddHttpClient("pokeapi", c =>
{
    c.BaseAddress = new Uri("https://pokeapi.co/api/v2/");
    c.Timeout = TimeSpan.FromSeconds(10);
});

// run state persistence
builder.Services.AddSingleton(new RunStateStore(Path.Combine(AppContext.BaseDirectory, "runstate.json")));
builder.Services.AddSingleton<EncounterService>();
builder.Services.AddSingleton<MoveMetaService>();

var app = builder.Build();
app.UseCors();

// -------------------- App State --------------------
var state = new ConcurrentDictionary<string, object?>();
state["latest"] = null;
state["error"] = null;

string? watchedPath = null;
FileSystemWatcher? watcher = null;
CancellationTokenSource? debounceCts = null;
string currentGameMode = "emerald";

// SSE subscribers
var sseSubscribers = new ConcurrentDictionary<Guid, SseSubscriber>();

// -------------------- File Read Helpers --------------------
static byte[] ReadAllBytesStable(string path, int maxAttempts = 30, int delayMs = 50)
{
    Exception? last = null;

    for (int i = 0; i < maxAttempts; i++)
    {
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var ms = new MemoryStream();
            fs.CopyTo(ms);
            var data = ms.ToArray();

            if (data.Length < 0x1000)
                throw new IOException($"Save read too small ({data.Length} bytes).");

            return data;
        }
        catch (Exception ex)
        {
            last = ex;
            Thread.Sleep(delayMs);
        }
    }

    throw new IOException($"Could not read save file stably: {path}", last);
}

// -------------------- Reflection Helpers --------------------
static object? GetProp(object obj, string name)
{
    var t = obj.GetType();
    var p = t.GetProperty(name, BindingFlags.Instance | BindingFlags.Public);
    return p?.GetValue(obj);
}

static string? GetString(object obj, params string[] names)
{
    foreach (var n in names)
    {
        var v = GetProp(obj, n);
        if (v is string s && !string.IsNullOrWhiteSpace(s))
            return s;
    }
    return null;
}

static int? GetInt(object obj, params string[] names)
{
    foreach (var n in names)
    {
        var v = GetProp(obj, n);
        if (v is null) continue;
        try { return Convert.ToInt32(v); } catch { }
    }
    return null;
}

static bool? GetBool(object obj, params string[] names)
{
    foreach (var n in names)
    {
        var v = GetProp(obj, n);
        if (v is null) continue;

        if (v is bool b) return b;
        try { return Convert.ToBoolean(v); } catch { }
    }
    return null;
}

// -------------------- Save Loading (PKHeX-native) --------------------
static SaveFile LoadSaveFile(byte[] data, string path)
{
    var ext = Path.GetExtension(path); // ".sav", ".dsv", etc.
    object? obj = FileUtil.GetSupportedFile(data, ext, null!);

    if (obj is SaveFile sav)
        return sav;

    throw new InvalidDataException($"File loaded but was not recognized as a SaveFile. ext={ext}");
}

// -------------------- Mapping (async, resolves names) --------------------
static async Task<object> MapPokemonAsync(PKM pkm, NameCache names, CancellationToken ct)
{
    var species = GetInt(pkm, "Species") ?? 0;
    var isEmpty = species == 0;

    int? level = isEmpty ? null : GetInt(pkm, "CurrentLevel", "Level");
    int? nature = isEmpty ? null : GetInt(pkm, "Nature");
    int? ability = isEmpty ? null : GetInt(pkm, "Ability");
    // Prefer explicit ID field; on some formats HeldItem can be game-internal index.
    int? heldItem = isEmpty ? null : GetInt(pkm, "HeldItemID", "HeldItem");
    if (heldItem == 0) heldItem = null;

    // Moves
    int? m1 = isEmpty ? null : GetInt(pkm, "Move1");
    int? m2 = isEmpty ? null : GetInt(pkm, "Move2");
    int? m3 = isEmpty ? null : GetInt(pkm, "Move3");
    int? m4 = isEmpty ? null : GetInt(pkm, "Move4");
    if (m1 == 0) m1 = null;
    if (m2 == 0) m2 = null;
    if (m3 == 0) m3 = null;
    if (m4 == 0) m4 = null;

    // Types
    int? t1 = isEmpty ? null : GetInt(pkm, "Type1");
    int? t2 = isEmpty ? null : GetInt(pkm, "Type2");
    if (t1 == 0) t1 = null;
    if (t2 == 0) t2 = null;

    // Stats
    int? hp = isEmpty ? null : GetInt(pkm, "Stat_HP", "StatsHP");
    int? atk = isEmpty ? null : GetInt(pkm, "Stat_ATK", "StatsATK");
    int? def = isEmpty ? null : GetInt(pkm, "Stat_DEF", "StatsDEF");
    int? spa = isEmpty ? null : GetInt(pkm, "Stat_SPA", "StatsSPA");
    int? spd = isEmpty ? null : GetInt(pkm, "Stat_SPD", "StatsSPD");
    int? spe = isEmpty ? null : GetInt(pkm, "Stat_SPE", "StatsSPE");

    // IVs
    int? ivHp = isEmpty ? null : GetInt(pkm, "IV_HP");
    int? ivAtk = isEmpty ? null : GetInt(pkm, "IV_ATK");
    int? ivDef = isEmpty ? null : GetInt(pkm, "IV_DEF");
    int? ivSpa = isEmpty ? null : GetInt(pkm, "IV_SPA");
    int? ivSpd = isEmpty ? null : GetInt(pkm, "IV_SPD");
    int? ivSpe = isEmpty ? null : GetInt(pkm, "IV_SPE");

    // EVs
    int? evHp = isEmpty ? null : GetInt(pkm, "EV_HP");
    int? evAtk = isEmpty ? null : GetInt(pkm, "EV_ATK");
    int? evDef = isEmpty ? null : GetInt(pkm, "EV_DEF");
    int? evSpa = isEmpty ? null : GetInt(pkm, "EV_SPA");
    int? evSpd = isEmpty ? null : GetInt(pkm, "EV_SPD");
    int? evSpe = isEmpty ? null : GetInt(pkm, "EV_SPE");

    // Met / location
    int? metLocation = isEmpty ? null : GetInt(pkm, "Met_Location", "MetLocation");
    string? metLocationName = null;
    if (!isEmpty && metLocation is not null)
    {
        try
        {
            metLocationName = GameInfo.GetLocationName(
                false,
                (ushort)metLocation.Value,
                pkm.Format,
                pkm.Generation,
                pkm.Version
            );
        }
        catch
        {
            metLocationName = null;
        }
    }

    int? metLevel = isEmpty ? null : GetInt(pkm, "Met_Level", "MetLevel");
    int? ball = isEmpty ? null : GetInt(pkm, "Ball");
    int? gender = isEmpty ? null : GetInt(pkm, "Gender");
    bool? shiny = isEmpty ? null : GetBool(pkm, "IsShiny", "Shiny");

    // Strings directly from PKM
    string? nickname = isEmpty ? null : GetString(pkm, "Nickname");
    string? otName = isEmpty ? null : GetString(pkm, "OT_Name", "OTName", "OT");

    int? tid = isEmpty ? null : GetInt(pkm, "TID", "TID16", "TrainerID");
    int? sid = isEmpty ? null : GetInt(pkm, "SID", "SID16", "SecretID");

    // Resolve names (PokeAPI + cache)
    string? speciesName = isEmpty ? null : await names.GetPokemonNameAsync(species, ct);
    string? abilityName = (isEmpty || ability is null) ? null : await names.GetAbilityNameAsync(ability.Value, ct);
    string? natureName = (isEmpty || nature is null)
        ? null
        : GetNatureNameFromIndex(nature.Value) ?? await names.GetNatureNameAsync(nature.Value, ct);
    string? heldItemName = null;
    if (!isEmpty && heldItem is not null)
    {
        heldItemName = GetHeldItemNameFromGameStrings(pkm, heldItem.Value);
        // Compatibility fallback for older PKHeX model shapes.
        if (string.IsNullOrWhiteSpace(heldItemName))
            heldItemName = GetString(pkm, "HeldItemString", "HeldItemName", "ItemName");
        if (string.IsNullOrWhiteSpace(heldItemName))
            heldItemName = await names.GetItemNameAsync(heldItem.Value, ct);
    }

    // Fallback: some PKM reads do not expose type fields directly.
    if (!isEmpty && t1 is null)
    {
        var fallbackTypes = await names.GetPokemonTypeIdsAsync(species, ct);
        if (fallbackTypes is { Length: > 0 })
        {
            t1 = fallbackTypes[0];
            t2 = fallbackTypes.Length > 1 ? fallbackTypes[1] : null;
        }
    }

    string?[]? moveNames = null;
    if (!isEmpty)
    {
        moveNames = new string?[]
        {
            m1 is null ? null : await names.GetMoveNameAsync(m1.Value, ct),
            m2 is null ? null : await names.GetMoveNameAsync(m2.Value, ct),
            m3 is null ? null : await names.GetMoveNameAsync(m3.Value, ct),
            m4 is null ? null : await names.GetMoveNameAsync(m4.Value, ct),
        };
    }

    string?[]? typeNames = null;
    if (!isEmpty && t1 is not null)
    {
        var tn1 = await names.GetTypeNameAsync(t1.Value, ct);
        if (t2 is not null && t2.Value != t1.Value)
        {
            var tn2 = await names.GetTypeNameAsync(t2.Value, ct);
            typeNames = new[] { tn1, tn2 };
        }
        else
        {
            typeNames = new[] { tn1 };
        }
    }

    return new
    {
        isEmpty,
        species,
        speciesName,

        nickname,
        level,

        nature,
        natureName,

        ability,
        abilityName,

        heldItem,
        heldItemName,

        moves = isEmpty ? null : new[] { m1, m2, m3, m4 },
        moveNames,

        types = (isEmpty || t1 is null) ? null : new[] { t1, t2 },
        typeNames,

        stats = (isEmpty || hp is null) ? null : new { hp, atk, def, spa, spd, spe },
        ivs = (isEmpty || ivHp is null) ? null : new { hp = ivHp, atk = ivAtk, def = ivDef, spa = ivSpa, spd = ivSpd, spe = ivSpe },
        evs = (isEmpty || evHp is null) ? null : new { hp = evHp, atk = evAtk, def = evDef, spa = evSpa, spd = evSpd, spe = evSpe },

        ot = otName,
        tid,
        sid,

        metLocation,
        metLocationName,
        metLevel,
        ball,
        gender,
        shiny
    };
}

static async Task<object> ParseSaveAsync(string path, NameCache names, CancellationToken ct)
{
    var data = ReadAllBytesStable(path);
    var sav = LoadSaveFile(data, path);
    var detectedGameMode = DetectGameMode(sav);

    var trainer = new
    {
        name = GetString(sav, "OT", "TrainerName") ?? "Unknown",
        tid = GetInt(sav, "TID", "TID16", "TrainerID"),
        sid = GetInt(sav, "SID", "SID16", "SecretID"),
        money = GetInt(sav, "Money"),
        playTime = new
        {
            hours = GetInt(sav, "PlayedHours"),
            minutes = GetInt(sav, "PlayedMinutes")
        }
    };

    // Party (full mapping)
    var partyList = new List<object>();
    if (GetProp(sav, "PartyData") is IEnumerable<PKM> partyEnum)
    {
        foreach (var p in partyEnum)
            partyList.Add(await MapPokemonAsync(p, names, ct));
    }

    // Boxes (flattened list but now includes speciesName + metLocationName too)
    var boxes = new List<object>();
    var boxCount = GetInt(sav, "BoxCount") ?? 0;

    var getBoxData = sav.GetType().GetMethod("GetBoxData", BindingFlags.Instance | BindingFlags.Public, new[] { typeof(int) });
    if (getBoxData is not null)
    {
        for (int b = 0; b < boxCount; b++)
        {
            var boxData = getBoxData.Invoke(sav, new object[] { b }) as PKM[];
            if (boxData is null) continue;

            for (int s = 0; s < boxData.Length; s++)
            {
                var pkm = boxData[s];
                var species = GetInt(pkm, "Species") ?? 0;

                string? speciesName = species == 0 ? null : await names.GetPokemonNameAsync(species, ct);

                int? metLoc = species == 0 ? null : GetInt(pkm, "Met_Location", "MetLocation");
                string? metLocName = null;
                if (species != 0 && metLoc is not null)
                {
                    try
                    {
                        metLocName = GameInfo.GetLocationName(false, (ushort)metLoc.Value, pkm.Format, pkm.Generation, pkm.Version);
                    }
                    catch { metLocName = null; }
                }

                boxes.Add(new
                {
                    box = b,
                    slot = s,
                    isEmpty = species == 0,
                    species,
                    speciesName,
                    nickname = species == 0 ? null : GetString(pkm, "Nickname"),
                    level = species == 0 ? (int?)null : GetInt(pkm, "CurrentLevel", "Level"),
                    metLocation = metLoc,
                    metLocationName = metLocName
                });
            }
        }
    }

    return new
    {
        file = new { path },
        game = new
        {
            mode = detectedGameMode,
            generation = (int)sav.Generation,
            version = sav.Version.ToString()
        },
        trainer,
        party = partyList,
        boxes,
        updatedAt = DateTimeOffset.Now
    };
}

static string DetectGameMode(SaveFile sav)
{
    var version = sav.Version.ToString();
    if (sav.Generation == 3 && (string.Equals(version, "E", StringComparison.OrdinalIgnoreCase) || version.Contains("Emerald", StringComparison.OrdinalIgnoreCase)))
        return "emerald";

    if (sav.Generation == 4 && (
        string.Equals(version, "Pt", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(version, "Platinum", StringComparison.OrdinalIgnoreCase) ||
        version.Contains("Plat", StringComparison.OrdinalIgnoreCase)))
        return "platinum";

    return "emerald";
}

// -------------------- Encounter auto-import helpers --------------------
static string NormalizeAreaKey(string value)
{
    return string.Join(' ', value
        .Trim()
        .ToLowerInvariant()
        .Split(' ', StringSplitOptions.RemoveEmptyEntries));
}

static Dictionary<string, string> BuildEncounterAreaLookup(IEnumerable<string> areas)
{
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    foreach (var area in areas)
    {
        map[NormalizeAreaKey(area)] = area;
    }
    return map;
}

static string? ResolveEncounterAreaFromLocation(string? rawLocation, Dictionary<string, string> areaLookup)
{
    if (string.IsNullOrWhiteSpace(rawLocation))
        return null;

    var location = rawLocation.Trim();

    if (areaLookup.TryGetValue(NormalizeAreaKey(location), out var exact))
        return exact;

    var routeMatch = System.Text.RegularExpressions.Regex.Match(location, @"^Route\s+(\d{3})\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    if (routeMatch.Success)
    {
        var routeKey = NormalizeAreaKey($"Route {routeMatch.Groups[1].Value}");
        if (areaLookup.TryGetValue(routeKey, out var route))
            return route;
    }

    var aliases = new (string Prefix, string Canonical)[]
    {
        ("Petalburg Woods", "Petalburg Woods"),
        ("Rusturf Tunnel", "Rusturf Tunnel"),
        ("Granite Cave", "Granite Cave 1F"),
        ("Fiery Path", "Fiery Path"),
        ("Meteor Falls", "Meteor Falls 1F 1R"),
        ("Mt. Pyre", "Mt. Pyre 1F"),
        ("Mt Pyre", "Mt. Pyre 1F"),
        ("Victory Road", "Victory Road 1F"),
        ("Safari Zone", "Safari Zone South"),
    };

    foreach (var alias in aliases)
    {
        if (!location.StartsWith(alias.Prefix, StringComparison.OrdinalIgnoreCase))
            continue;

        var key = NormalizeAreaKey(alias.Canonical);
        if (areaLookup.TryGetValue(key, out var mapped))
            return mapped;
    }

    var normalizedLocation = NormalizeAreaKey(location);
    string? bestPrefixMatch = null;
    foreach (var area in areaLookup.Values.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        var normalizedArea = NormalizeAreaKey(area);
        if (!normalizedLocation.StartsWith(normalizedArea, StringComparison.OrdinalIgnoreCase))
            continue;

        if (bestPrefixMatch is null || normalizedArea.Length > NormalizeAreaKey(bestPrefixMatch).Length)
            bestPrefixMatch = area;
    }
    if (bestPrefixMatch is not null)
        return bestPrefixMatch;

    return null;
}

static string? ResolveBattleCatalogPath(string gameMode)
{
    var primary = string.Equals(gameMode, "platinum", StringComparison.OrdinalIgnoreCase)
        ? new[]
        {
            Path.Combine(AppContext.BaseDirectory, "battles_platinum.json"),
            Path.Combine(AppContext.BaseDirectory, "run", "battles_platinum.json")
        }
        : new[]
        {
            Path.Combine(AppContext.BaseDirectory, "battles_emerald.json"),
            Path.Combine(AppContext.BaseDirectory, "run", "battles_emerald.json")
        };

    var fallback = string.Equals(gameMode, "platinum", StringComparison.OrdinalIgnoreCase)
        ? new[]
        {
            Path.Combine(AppContext.BaseDirectory, "battles_emerald.json"),
            Path.Combine(AppContext.BaseDirectory, "run", "battles_emerald.json")
        }
        : new[]
        {
            Path.Combine(AppContext.BaseDirectory, "battles_platinum.json"),
            Path.Combine(AppContext.BaseDirectory, "run", "battles_platinum.json")
        };

    var candidates = primary.Concat(fallback);
    return candidates.FirstOrDefault(File.Exists);
}

static BattleCatalog LoadBattleCatalog(string gameMode)
{
    try
    {
        var path = ResolveBattleCatalogPath(gameMode);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return new BattleCatalog();

        var json = File.ReadAllText(path);
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
        return JsonSerializer.Deserialize<BattleCatalog>(json, options) ?? new BattleCatalog();
    }
    catch
    {
        return new BattleCatalog();
    }
}

static EntityContext GetEntityContextForGeneration(byte generation)
{
    return generation switch
    {
        1 => EntityContext.Gen1,
        2 => EntityContext.Gen2,
        3 => EntityContext.Gen3,
        4 => EntityContext.Gen4,
        5 => EntityContext.Gen5,
        6 => EntityContext.Gen6,
        7 => EntityContext.Gen7,
        8 => EntityContext.Gen8,
        9 => EntityContext.Gen9,
        _ => EntityContext.None,
    };
}

static string? GetHeldItemNameFromGameStrings(PKM pkm, int heldItem)
{
    try
    {
        var context = GetEntityContextForGeneration(pkm.Generation);
        if (context == EntityContext.None)
            return null;

        var items = GameInfo.Strings.GetItemStrings(context, pkm.Version);
        if (heldItem <= 0 || heldItem >= items.Length)
            return null;

        var name = items[heldItem];
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
    catch
    {
        return null;
    }
}

static string? GetNatureNameFromIndex(int natureIndex) => natureIndex switch
{
    0 => "Hardy",
    1 => "Lonely",
    2 => "Brave",
    3 => "Adamant",
    4 => "Naughty",
    5 => "Bold",
    6 => "Docile",
    7 => "Relaxed",
    8 => "Impish",
    9 => "Lax",
    10 => "Timid",
    11 => "Hasty",
    12 => "Serious",
    13 => "Jolly",
    14 => "Naive",
    15 => "Modest",
    16 => "Mild",
    17 => "Quiet",
    18 => "Bashful",
    19 => "Rash",
    20 => "Calm",
    21 => "Gentle",
    22 => "Sassy",
    23 => "Careful",
    24 => "Quirky",
    _ => null
};

static async Task<int> ImportEncountersFromParsedAsync(object parsed, EncounterService svc, CancellationToken ct)
{
    // Nuzlocke rule choice: starters are not treated as route encounters for auto-import.
    var starterSpecies = new HashSet<int>
    {
        252, 253, 254, // Treecko line
        255, 256, 257, // Torchic line
        258, 259, 260  // Mudkip line
    };

    var json = JsonSerializer.SerializeToElement(parsed);
    var party = json.TryGetProperty("party", out var pEl) && pEl.ValueKind == JsonValueKind.Array ? pEl.EnumerateArray().ToList() : new();
    var boxes = json.TryGetProperty("boxes", out var bEl) && bEl.ValueKind == JsonValueKind.Array ? bEl.EnumerateArray().ToList() : new();

    var run = await svc.GetEncounterRowsAsync(ct);
    var lockedAreas = new HashSet<string>(run.Where(r => r.Status == "caught").Select(r => r.Area), StringComparer.OrdinalIgnoreCase);
    var areaLookup = BuildEncounterAreaLookup(svc.GetAreas());

    var lockedCount = 0;

    async Task TryLock(JsonElement pokeEl)
    {
        if (pokeEl.TryGetProperty("isEmpty", out var ie) && ie.ValueKind == JsonValueKind.True)
            return;

        var species = pokeEl.TryGetProperty("species", out var sp) ? sp.GetInt32() : 0;
        if (species <= 0) return;
        if (starterSpecies.Contains(species)) return;

        var locName = pokeEl.TryGetProperty("metLocationName", out var ln) && ln.ValueKind == JsonValueKind.String
            ? ln.GetString()
            : null;

        var area = ResolveEncounterAreaFromLocation(locName, areaLookup);
        if (string.IsNullOrWhiteSpace(area)) return;
        if (lockedAreas.Contains(area)) return;

        var speciesName = pokeEl.TryGetProperty("speciesName", out var sn) && sn.ValueKind == JsonValueKind.String ? sn.GetString() : null;
        var nickname = pokeEl.TryGetProperty("nickname", out var nn) && nn.ValueKind == JsonValueKind.String ? nn.GetString() : null;

        await svc.LockEncounterAsync(area, species, speciesName, nickname, ct);
        lockedAreas.Add(area);
        lockedCount++;
    }

    foreach (var p in party)
        await TryLock(p);

    foreach (var b in boxes)
        await TryLock(b);

    return lockedCount;
}

// -------------------- Watch + Refresh --------------------
void NotifySubscribers()
{
    foreach (var kv in sseSubscribers)
        kv.Value.TrySend("update");
}

async Task RefreshNowAsync(string path, CancellationToken ct)
{
    var names = app.Services.GetRequiredService<NameCache>();
    var encounters = app.Services.GetRequiredService<EncounterService>();

    try
    {
        var parsed = await ParseSaveAsync(path, names, ct);
        var parsedEl = JsonSerializer.SerializeToElement(parsed);
        if (parsedEl.TryGetProperty("game", out var gameEl) &&
            gameEl.ValueKind == JsonValueKind.Object &&
            gameEl.TryGetProperty("mode", out var modeEl) &&
            modeEl.ValueKind == JsonValueKind.String)
        {
            currentGameMode = string.Equals(modeEl.GetString(), "platinum", StringComparison.OrdinalIgnoreCase) ? "platinum" : "emerald";
        }
        else
        {
            currentGameMode = "emerald";
        }
        encounters.SetGameMode(currentGameMode);

        try
        {
            await ImportEncountersFromParsedAsync(parsed, encounters, ct);
        }
        catch
        {
            // Keep save parsing/update alive even if run-state import fails.
        }

        state["latest"] = parsed;
        state["error"] = null;
        NotifySubscribers();
    }
    catch (Exception ex)
    {
        state["error"] = ex.ToString();
        state["latest"] = null;
        NotifySubscribers();
    }
}

void DebouncedRefresh(string path)
{
    debounceCts?.Cancel();
    debounceCts = new CancellationTokenSource();
    var token = debounceCts.Token;

    _ = Task.Run(async () =>
    {
        try
        {
            await Task.Delay(250, token);
            await RefreshNowAsync(path, token);
        }
        catch (OperationCanceledException) { }
    }, token);
}

void StartWatching(string path)
{
    if (!File.Exists(path))
        throw new FileNotFoundException("Save file not found.", path);

    watchedPath = Path.GetFullPath(path);

    watcher?.Dispose();
    watcher = new FileSystemWatcher(Path.GetDirectoryName(watchedPath)!)
    {
        Filter = Path.GetFileName(watchedPath),
        NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.CreationTime | NotifyFilters.FileName
    };

    watcher.Changed += (_, __) => DebouncedRefresh(watchedPath);
    watcher.Created += (_, __) => DebouncedRefresh(watchedPath);
    watcher.Renamed += (_, __) => DebouncedRefresh(watchedPath);
    watcher.Error += (_, __) => DebouncedRefresh(watchedPath);

    watcher.EnableRaisingEvents = true;

    DebouncedRefresh(watchedPath);
}

static string? BrowseForSavePath(string? currentPath)
{
    string? selected = null;
    Exception? failure = null;
    var done = new ManualResetEventSlim(false);
    var initialDir = string.Empty;

    if (!string.IsNullOrWhiteSpace(currentPath))
    {
        try
        {
            var full = Path.GetFullPath(currentPath);
            var dir = Path.GetDirectoryName(full);
            if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir))
                initialDir = dir;
        }
        catch
        {
            // Use default folder.
        }
    }

    var thread = new Thread(() =>
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            using var dialog = new OpenFileDialog
            {
                Title = "Select Pokemon save file",
                Filter = "Pokemon Save Files (*.sav;*.dsv)|*.sav;*.dsv|All Files (*.*)|*.*",
                CheckFileExists = true,
                CheckPathExists = true,
                Multiselect = false
            };

            if (!string.IsNullOrWhiteSpace(initialDir) && Directory.Exists(initialDir))
                dialog.InitialDirectory = initialDir;

            using var owner = new Form
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                TopMost = true
            };

            owner.Load += (_, __) =>
            {
                owner.BeginInvoke(new Action(() =>
                {
                    if (dialog.ShowDialog(owner) == DialogResult.OK)
                        selected = dialog.FileName;
                    owner.Close();
                }));
            };

            Application.Run(owner);
        }
        catch (Exception ex)
        {
            failure = ex;
        }
        finally
        {
            done.Set();
        }
    });

    thread.SetApartmentState(ApartmentState.STA);
    thread.IsBackground = true;
    thread.Start();

    if (!done.Wait(TimeSpan.FromMinutes(2)))
        throw new TimeoutException("File picker did not complete within 2 minutes.");

    if (failure is not null)
        throw failure;

    return selected;
}

// -------------------- API --------------------

app.MapPost("/api/encounters/auto-import", async (EncounterService svc, CancellationToken ct) =>
{
    if (state.TryGetValue("latest", out var latestObj) is false || latestObj is null)
        return Results.BadRequest(new { error = "No save loaded yet. Load/watch a save first." });

    var latestEl = JsonSerializer.SerializeToElement(latestObj);
    if (latestEl.TryGetProperty("game", out var gameEl) &&
        gameEl.ValueKind == JsonValueKind.Object &&
        gameEl.TryGetProperty("mode", out var modeEl) &&
        modeEl.ValueKind == JsonValueKind.String)
    {
        currentGameMode = string.Equals(modeEl.GetString(), "platinum", StringComparison.OrdinalIgnoreCase) ? "platinum" : "emerald";
        svc.SetGameMode(currentGameMode);
    }

    var lockedCount = await ImportEncountersFromParsedAsync(latestObj, svc, ct);
    return Results.Ok(new { locked = lockedCount });
});

app.MapGet("/", () => Results.Ok(new
{
    name = "Emerald Nuzlocke Tool Backend",
    watching = watchedPath,
    endpoints = new[]
    {
        "POST /api/upload-save (multipart/form-data: file)",
        "POST /api/watch { path }",
        "GET  /api/browse-save",
        "GET  /api/state",
        "GET  /api/stream"
    }
}));

app.MapPost("/api/upload-save", async (HttpRequest request, CancellationToken ct) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Expected multipart/form-data." });

    try
    {
        var form = await request.ReadFormAsync(ct);
        var file = form.Files["file"] ?? form.Files.FirstOrDefault();
        if (file is null)
            return Results.BadRequest(new { error = "No file uploaded. Use form field name 'file'." });

        if (file.Length <= 0)
            return Results.BadRequest(new { error = "Uploaded file is empty." });

        var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (ext is not ".sav" and not ".dsv")
            return Results.BadRequest(new { error = "Unsupported file type. Upload a .sav or .dsv file." });

        var uploadDir = Path.Combine(AppContext.BaseDirectory, "uploaded-saves");
        Directory.CreateDirectory(uploadDir);

        var targetName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}{ext}";
        var targetPath = Path.Combine(uploadDir, targetName);

        await using (var fs = new FileStream(targetPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await file.CopyToAsync(fs, ct);

        StartWatching(targetPath);
        return Results.Ok(new
        {
            uploaded = true,
            originalName = file.FileName,
            watching = watchedPath
        });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapPost("/api/watch", (WatchRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Path))
        return Results.BadRequest(new { error = "Path is required." });

    try
    {
        StartWatching(req.Path);
        return Results.Ok(new { watching = watchedPath });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapGet("/api/state", () =>
{
    if (state.TryGetValue("latest", out var latest) && latest is not null)
        return Results.Ok(latest);

    if (state.TryGetValue("error", out var err) && err is string s && !string.IsNullOrWhiteSpace(s))
        return Results.Ok(new { watching = watchedPath, status = "error", error = s });

    return Results.Ok(new { watching = watchedPath, status = "no save loaded yet" });
});

app.MapGet("/api/stream", async (HttpContext ctx) =>
{
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";
    ctx.Response.Headers.ContentType = "text/event-stream";

    var id = Guid.NewGuid();
    var sub = new SseSubscriber(ctx);
    sseSubscribers[id] = sub;

    await sub.SendRawAsync("event: ready\ndata: ok\n\n", ctx.RequestAborted);

    try
    {
        while (!ctx.RequestAborted.IsCancellationRequested)
        {
            var msg = await sub.ReadAsync(ctx.RequestAborted);
            await sub.SendRawAsync($"event: {msg}\ndata: {DateTimeOffset.Now:O}\n\n", ctx.RequestAborted);
        }
    }
    catch (OperationCanceledException) { }
    finally
    {
        sseSubscribers.TryRemove(id, out _);
        sub.Dispose();
    }
});

app.MapGet("/api/encounters", async (EncounterService svc, CancellationToken ct) =>
{
    var rows = await svc.GetEncounterRowsAsync(ct);
    return Results.Ok(rows);
});

app.MapGet("/api/encounters/families", async (EncounterService svc, CancellationToken ct) =>
{
    var fams = await svc.GetCaughtFamiliesAsync(ct);
    return Results.Ok(new { families = fams.ToArray() });
});

app.MapPost("/api/encounters/lock", async (LockEncounterRequest req, EncounterService svc, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Area))
        return Results.BadRequest(new { error = "Area is required." });
    if (req.Species <= 0)
        return Results.BadRequest(new { error = "Species must be > 0." });

    try
    {
        await svc.LockEncounterAsync(req.Area, req.Species, req.SpeciesName, req.Nickname, ct);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}); 

app.MapPost("/api/encounters/unlock", async (UnlockEncounterRequest req, EncounterService svc, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Area))
        return Results.BadRequest(new { error = "Area is required." });

    try
    {
        var removed = await svc.UnlockEncounterAsync(req.Area, ct);
        return Results.Ok(new { ok = true, removed });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/browse-save", () =>
{
    try
    {
        var selected = BrowseForSavePath(watchedPath);
        if (string.IsNullOrWhiteSpace(selected))
            return Results.Ok(new { cancelled = true });

        return Results.Ok(new { path = selected, cancelled = false });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Could not open file browser: {ex.Message}");
    }
});

app.MapPost("/api/encounters/status", async (EncounterStatusRequest req, EncounterService svc, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Area))
        return Results.BadRequest(new { error = "Area is required." });
    if (string.IsNullOrWhiteSpace(req.Status))
        return Results.BadRequest(new { error = "Status is required." });

    var status = req.Status.Trim().ToLowerInvariant();
    if (status is not ("alive" or "dead"))
        return Results.BadRequest(new { error = "Status must be 'alive' or 'dead'." });

    try
    {
        var updated = await svc.SetEncounterStatusAsync(req.Area, status, ct);
        return Results.Ok(new { ok = true, updated });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/box/{box:int}/{slot:int}", async (int box, int slot, NameCache names, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(watchedPath) || !System.IO.File.Exists(watchedPath))
        return Results.BadRequest(new { error = "No watched save path set. Load/watch a save first." });

    // Load save fresh
    var data = ReadAllBytesStable(watchedPath);
    var sav = LoadSaveFile(data, watchedPath);

    var boxCount = GetInt(sav, "BoxCount") ?? 0;
    if (box < 0 || box >= boxCount)
        return Results.BadRequest(new { error = $"Box out of range (0..{boxCount - 1})." });

    var getBoxData = sav.GetType().GetMethod("GetBoxData", BindingFlags.Instance | BindingFlags.Public, new[] { typeof(int) });
    if (getBoxData is null)
        return Results.Problem("Save type does not support GetBoxData.");

    var boxData = getBoxData.Invoke(sav, new object[] { box }) as PKM[];
    if (boxData is null)
        return Results.Problem("Could not read box data.");

    if (slot < 0 || slot >= boxData.Length)
        return Results.BadRequest(new { error = $"Slot out of range (0..{boxData.Length - 1})." });

    var pkm = boxData[slot];
    var mapped = await MapPokemonAsync(pkm, names, ct);
    return Results.Ok(mapped);
});

app.MapGet("/api/encounters/table/{area}", async (
    string area,
    string? timeOfDay,
    EncounterService svc,
    NameCache names,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(area))
        return Results.BadRequest(new { error = "Area required" });

    var table = await svc.GetEncounterTableAsync(area, timeOfDay, ct);
    var resolvedByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

    foreach (var method in table)
    {
        foreach (var slot in method.Slots)
        {
            if (slot.Species <= 0 || string.IsNullOrWhiteSpace(slot.SpeciesName))
                continue;

            if (!resolvedByName.TryGetValue(slot.SpeciesName, out var resolvedSpecies))
            {
                var resolved = await names.GetPokemonIdByNameAsync(slot.SpeciesName, ct);
                resolvedSpecies = resolved.GetValueOrDefault(slot.Species);
                resolvedByName[slot.SpeciesName] = resolvedSpecies;
            }

            slot.Species = resolvedSpecies;
        }
    }

    return Results.Ok(table);
});

app.MapGet("/api/battles", () =>
{
    var catalog = LoadBattleCatalog(currentGameMode);
    return Results.Ok(catalog);
});

app.MapGet("/api/moves/meta", async (string? ids, MoveMetaService moveMeta, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(ids))
        return Results.BadRequest(new { error = "Query parameter 'ids' is required (comma-separated move IDs)." });

    var parsed = ids
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(x => int.TryParse(x, out var id) ? id : 0)
        .Where(x => x > 0)
        .Distinct()
        .ToArray();

    if (parsed.Length == 0)
        return Results.BadRequest(new { error = "No valid move IDs were provided." });

    var result = await moveMeta.GetMoveMetaBatchAsync(parsed, ct);
    return Results.Ok(result);
});

app.MapGet("/api/moves/meta/{id:int}", async (int id, MoveMetaService moveMeta, CancellationToken ct) =>
{
    if (id <= 0)
        return Results.BadRequest(new { error = "Move ID must be > 0." });

    var result = await moveMeta.GetMoveMetaAsync(id, ct);
    return Results.Ok(result);
});

app.Logger.LogInformation("Backend started with no save loaded. Upload a save to begin.");

app.Run();

// -------------------- Types --------------------
record WatchRequest(string Path);

sealed class SseSubscriber : IDisposable
{
    private readonly HttpContext _ctx;
    private readonly BlockingCollection<string> _queue = new(new ConcurrentQueue<string>());

    public SseSubscriber(HttpContext ctx) => _ctx = ctx;

    public bool TrySend(string message) => _queue.TryAdd(message);

    public Task<string> ReadAsync(CancellationToken ct)
        => Task.Run(() => _queue.Take(ct), ct);

    public async Task SendRawAsync(string text, CancellationToken ct)
    {
        await _ctx.Response.WriteAsync(text, ct);
        await _ctx.Response.Body.FlushAsync(ct);
    }

    public void Dispose() => _queue.Dispose();
}

// -------------------- Name Cache (PokeAPI + local file cache) --------------------
sealed class NameCache
{
    private readonly IHttpClientFactory _http;
    private readonly string _cachePath;

    private readonly SemaphoreSlim _gate = new(1, 1);

    private CacheModel _cache = new();

    public NameCache(IHttpClientFactory http)
    {
        _http = http;
        _cachePath = Path.Combine(AppContext.BaseDirectory, "namecache.json");
        Load();
    }

    public Task<string> GetPokemonNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("pokemon", id, _cache.Pokemon, ct);

    public async Task<int?> GetPokemonIdByNameAsync(string name, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        var normalizedInput = TitleCase(name.Trim().Replace("-", " "));
        var cached = _cache.Pokemon.FirstOrDefault(kvp => string.Equals(kvp.Value, normalizedInput, StringComparison.OrdinalIgnoreCase));
        if (cached.Key > 0)
            return cached.Key;

        var client = _http.CreateClient("pokeapi");
        foreach (var candidate in BuildPokemonNameLookupCandidates(name))
        {
            try
            {
                using var resp = await client.GetAsync($"pokemon/{Uri.EscapeDataString(candidate)}/", ct);
                if (!resp.IsSuccessStatusCode)
                    continue;

                await using var stream = await resp.Content.ReadAsStreamAsync(ct);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

                var id = doc.RootElement.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                if (id <= 0)
                    continue;

                var canonical = doc.RootElement.GetProperty("name").GetString() ?? candidate;
                var canonicalTitle = TitleCase(canonical.Replace("-", " "));

                await _gate.WaitAsync(ct);
                try
                {
                    if (!_cache.Pokemon.ContainsKey(id))
                        _cache.Pokemon[id] = canonicalTitle;
                    Save();
                }
                finally
                {
                    _gate.Release();
                }

                return id;
            }
            catch
            {
                // try next candidate
            }
        }

        return null;
    }

    public Task<string> GetMoveNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("move", id, _cache.Moves, ct);

    public Task<string> GetAbilityNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("ability", id, _cache.Abilities, ct);

    public Task<string> GetNatureNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("nature", id, _cache.Natures, ct);

    public Task<string> GetTypeNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("type", id, _cache.Types, ct);

    public Task<string> GetItemNameAsync(int id, CancellationToken ct) =>
        GetNameAsync("item", id, _cache.Items, ct);

    public async Task<int[]?> GetPokemonTypeIdsAsync(int speciesId, CancellationToken ct)
    {
        if (speciesId <= 0) return null;

        if (_cache.PokemonTypeIds.TryGetValue(speciesId, out var cached) && cached is { Length: > 0 })
            return cached;

        await _gate.WaitAsync(ct);
        try
        {
            if (_cache.PokemonTypeIds.TryGetValue(speciesId, out cached) && cached is { Length: > 0 })
                return cached;

            var client = _http.CreateClient("pokeapi");
            using var resp = await client.GetAsync($"pokemon/{speciesId}/", ct);
            resp.EnsureSuccessStatusCode();

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            if (!doc.RootElement.TryGetProperty("types", out var typesEl) || typesEl.ValueKind != JsonValueKind.Array)
                return null;

            var list = new List<(int slot, int typeId)>();
            foreach (var entry in typesEl.EnumerateArray())
            {
                var slot = entry.TryGetProperty("slot", out var slotEl) ? slotEl.GetInt32() : 99;
                if (!entry.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.Object)
                    continue;

                if (!typeEl.TryGetProperty("url", out var urlEl) || urlEl.ValueKind != JsonValueKind.String)
                    continue;

                var url = urlEl.GetString();
                if (string.IsNullOrWhiteSpace(url))
                    continue;

                var m = System.Text.RegularExpressions.Regex.Match(url, @"/type/(\d+)/");
                if (!m.Success || !int.TryParse(m.Groups[1].Value, out var typeId) || typeId <= 0)
                    continue;

                list.Add((slot, typeId));
            }

            var resolved = list
                .OrderBy(x => x.slot)
                .Select(x => x.typeId)
                .Distinct()
                .ToArray();

            if (resolved.Length == 0)
                return null;

            _cache.PokemonTypeIds[speciesId] = resolved;
            Save();
            return resolved;
        }
        catch
        {
            return null;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<string> GetNameAsync(string endpoint, int id, Dictionary<int, string> dict, CancellationToken ct)
    {
        if (id <= 0) return $"{endpoint} #{id}";

        if (dict.TryGetValue(id, out var cached))
            return cached;

        await _gate.WaitAsync(ct);
        try
        {
            if (dict.TryGetValue(id, out cached))
                return cached;

            var client = _http.CreateClient("pokeapi");
            using var resp = await client.GetAsync($"{endpoint}/{id}/", ct);
            resp.EnsureSuccessStatusCode();

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            var name = doc.RootElement.GetProperty("name").GetString() ?? $"{endpoint} #{id}";
            name = TitleCase(name.Replace("-", " "));
            dict[id] = name;
            Save();
            return name;
        }
        catch
        {
            return $"{endpoint} #{id}";
        }
        finally
        {
            _gate.Release();
        }
    }

    private static string TitleCase(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return s;
        var parts = s.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        for (int i = 0; i < parts.Length; i++)
        {
            var p = parts[i];
            parts[i] = p.Length == 1 ? p.ToUpperInvariant()
                : char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant();
        }
        return string.Join(' ', parts);
    }

    private static IEnumerable<string> BuildPokemonNameLookupCandidates(string rawName)
    {
        var trimmed = rawName.Trim();
        if (trimmed.Length == 0)
            yield break;

        string NormalizeBasic(string s) =>
            s.ToLowerInvariant()
                .Replace(" ", "-")
                .Replace(".", "")
                .Replace("'", "")
                .Replace(":", "")
                .Replace("é", "e");

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var c in new[]
        {
            NormalizeBasic(trimmed),
            NormalizeBasic(trimmed).Replace("-female", "-f").Replace("-male", "-m"),
            NormalizeBasic(trimmed).Replace("♀", "-f").Replace("♂", "-m"),
            NormalizeBasic(trimmed).Replace("mr-mime", "mr-mime"),
            NormalizeBasic(trimmed).Replace("mime-jr", "mime-jr"),
            NormalizeBasic(trimmed).Replace("farfetchd", "farfetchd"),
            NormalizeBasic(trimmed).Replace("nidoranf", "nidoran-f").Replace("nidoranm", "nidoran-m")
        })
        {
            if (seen.Add(c))
                yield return c;
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_cachePath))
                return;

            var json = File.ReadAllText(_cachePath);
            var model = JsonSerializer.Deserialize<CacheModel>(json);
            if (model is not null)
                _cache = model;
        }
        catch
        {
            _cache = new CacheModel();
        }
    }

    private void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_cache, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_cachePath, json);
        }
        catch { }
    }

    private sealed class CacheModel
    {
        public Dictionary<int, string> Pokemon { get; set; } = new();
        public Dictionary<int, int[]> PokemonTypeIds { get; set; } = new();
        public Dictionary<int, string> Moves { get; set; } = new();
        public Dictionary<int, string> Abilities { get; set; } = new();
        public Dictionary<int, string> Natures { get; set; } = new();
        public Dictionary<int, string> Types { get; set; } = new();
        public Dictionary<int, string> Items { get; set; } = new();
    }
}


public sealed record LockEncounterRequest(string Area, int Species, string? SpeciesName, string? Nickname);
public sealed record UnlockEncounterRequest(string Area);
public sealed record EncounterStatusRequest(string Area, string Status);

public sealed class BattleCatalog
{
    public List<BattleFight> Fights { get; set; } = new();
}

public sealed class BattleFight
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Trainer { get; set; } = "";
    public string? Venue { get; set; }
    public string Ruleset { get; set; } = "singles";
    public List<BattlePokemon> OpponentTeam { get; set; } = new();
}

public sealed class BattlePokemon
{
    public int Species { get; set; }
    public string? SpeciesName { get; set; }
    public int Level { get; set; }
    public List<string> Types { get; set; } = new();
    public string? Ability { get; set; }
    public string? Item { get; set; }
    public string? Nature { get; set; }
    public BattleStats Stats { get; set; } = new();
    public List<BattleMove> Moves { get; set; } = new();
}

public sealed class BattleStats
{
    public int Hp { get; set; }
    public int Atk { get; set; }
    public int Def { get; set; }
    public int Spa { get; set; }
    public int Spd { get; set; }
    public int Spe { get; set; }
}

public sealed class BattleMove
{
    public string Name { get; set; } = "";
    public int Power { get; set; }
    public string Type { get; set; } = "Normal";
    public string Category { get; set; } = "Physical";
    public int? Accuracy { get; set; } = 100;
}

