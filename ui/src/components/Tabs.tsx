type Tab = { id: string; label: string };

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pb-2 tab-bar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={[
            "tab-pill",
            active === t.id ? "tab-pill-active" : ""
          ].join(" ")}
          onClick={() => onChange(t.id)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
