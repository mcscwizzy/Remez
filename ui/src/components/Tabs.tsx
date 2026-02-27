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
    <div className="flex flex-wrap gap-2 border-b pb-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={[
            "rounded-full px-3 py-1 text-sm border",
            active === t.id ? "bg-black text-white" : "bg-white"
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
