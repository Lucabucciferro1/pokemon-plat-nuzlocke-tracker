using System.Text.Json;

namespace PlatinumNuzlocke.Run;

public sealed class RunStateStore
{
    private readonly string _path;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public RunStateStore(string path)
    {
        _path = path;
    }

    public async Task<RunState> LoadAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (!File.Exists(_path))
                return new RunState();

            var json = await File.ReadAllTextAsync(_path, ct);
            var state = JsonSerializer.Deserialize<RunState>(json);
            return state ?? new RunState();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SaveAsync(RunState state, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(_path, json, ct);
        }
        finally
        {
            _gate.Release();
        }
    }
}

public sealed class RunState
{
    public Dictionary<string, EncounterEntry> Encounters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class EncounterEntry
{
    public int Species { get; set; }          // dex id
    public string? SpeciesName { get; set; }  // nice name for UI
    public string? Nickname { get; set; }
    public string Status { get; set; } = "alive"; // alive | dead | boxed (we’ll expand later)
    public DateTimeOffset CaughtAt { get; set; } = DateTimeOffset.UtcNow;
}