namespace PlatinumNuzlocke.Run;

public sealed record EncounterSlot(
    int Species,
    string? SpeciesName,
    int MinLevel,
    int MaxLevel,
    int? Rate = null,          // optional %
    int? FamilyRoot = null,    // for dupes clause greying
    bool IsCaughtFamily = false // computed at runtime
);

public sealed record EncounterMethod(
    string Method,                 // "Grass", "Surf", "Old Rod", etc.
    IReadOnlyList<EncounterSlot> Slots
);

public sealed record EncounterTableResponse(
    string Area,
    IReadOnlyList<EncounterMethod> Methods
);