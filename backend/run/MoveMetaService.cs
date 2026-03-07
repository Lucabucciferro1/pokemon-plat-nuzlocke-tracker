using System.Text.Json;

namespace PlatinumNuzlocke.Run;

public sealed class MoveMetaService
{
    private readonly IHttpClientFactory _http;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _cachePath;
    private Dictionary<int, MoveMetaDto> _cache = new();

    public MoveMetaService(IHttpClientFactory http)
    {
        _http = http;
        _cachePath = Path.Combine(AppContext.BaseDirectory, "movecache.json");
        Load();
    }

    public async Task<MoveMetaDto> GetMoveMetaAsync(int moveId, CancellationToken ct)
    {
        if (moveId <= 0)
            return MoveMetaDto.Unknown(moveId);

        if (_cache.TryGetValue(moveId, out var cached))
            return cached;

        await _gate.WaitAsync(ct);
        try
        {
            if (_cache.TryGetValue(moveId, out cached))
                return cached;

            var client = _http.CreateClient("pokeapi");
            using var resp = await client.GetAsync($"move/{moveId}/", ct);
            resp.EnsureSuccessStatusCode();

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            var root = doc.RootElement;
            var name = root.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
                ? ToTitleCase(nameEl.GetString() ?? $"Move {moveId}")
                : $"Move {moveId}";
            var power = root.TryGetProperty("power", out var powerEl) && powerEl.TryGetInt32(out var parsedPower)
                ? parsedPower
                : 0;
            var type = "Normal";
            if (root.TryGetProperty("type", out var typeEl)
                && typeEl.ValueKind == JsonValueKind.Object
                && typeEl.TryGetProperty("name", out var typeNameEl)
                && typeNameEl.ValueKind == JsonValueKind.String)
            {
                type = ToTitleCase(typeNameEl.GetString() ?? "Normal");
            }

            var category = "status";
            if (root.TryGetProperty("damage_class", out var classEl)
                && classEl.ValueKind == JsonValueKind.Object
                && classEl.TryGetProperty("name", out var classNameEl)
                && classNameEl.ValueKind == JsonValueKind.String)
            {
                category = (classNameEl.GetString() ?? "status").Trim().ToLowerInvariant();
            }

            var accuracy = root.TryGetProperty("accuracy", out var accEl) && accEl.TryGetInt32(out var parsedAcc)
                ? parsedAcc
                : 100;

            var meta = new MoveMetaDto(moveId, name, power, type, category, accuracy);
            _cache[moveId] = meta;
            Save();
            return meta;
        }
        catch
        {
            return MoveMetaDto.Unknown(moveId);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<MoveMetaDto>> GetMoveMetaBatchAsync(IEnumerable<int> moveIds, CancellationToken ct)
    {
        var unique = moveIds.Where(x => x > 0).Distinct().Take(200).ToArray();
        if (unique.Length == 0)
            return Array.Empty<MoveMetaDto>();

        var list = new List<MoveMetaDto>(unique.Length);
        foreach (var id in unique)
            list.Add(await GetMoveMetaAsync(id, ct));

        return list;
    }

    private static string ToTitleCase(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return value;

        var parts = value.Split('-', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < parts.Length; i++)
        {
            var p = parts[i];
            parts[i] = p.Length == 1
                ? p.ToUpperInvariant()
                : char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant();
        }
        return string.Join(' ', parts);
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_cachePath))
                return;

            var json = File.ReadAllText(_cachePath);
            var parsed = JsonSerializer.Deserialize<Dictionary<int, MoveMetaDto>>(json);
            if (parsed is not null)
                _cache = parsed;
        }
        catch
        {
            _cache = new();
        }
    }

    private void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_cache, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_cachePath, json);
        }
        catch
        {
            // Ignore cache save errors; runtime behavior still works with memory cache.
        }
    }
}

public sealed record MoveMetaDto(
    int Id,
    string Name,
    int Power,
    string Type,
    string Category,
    int Accuracy)
{
    public static MoveMetaDto Unknown(int id) => new(
        id,
        $"Move {id}",
        0,
        "Normal",
        "status",
        100);
}
