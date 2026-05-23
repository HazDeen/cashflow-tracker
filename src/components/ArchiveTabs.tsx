export function ArchiveTabs({
  value, onChange, activeLabel = "Активные", archiveLabel = "Архив",
}: {
  value: "active" | "archive";
  onChange: (v: "active" | "archive") => void;
  activeLabel?: string;
  archiveLabel?: string;
}) {
  return (
    <div className="flex p-0.5 bg-muted rounded-xl">
      {([
        { v: "active" as const, label: activeLabel },
        { v: "archive" as const, label: archiveLabel },
      ]).map(({ v, label }) => {
        const active = v === value;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
              active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
