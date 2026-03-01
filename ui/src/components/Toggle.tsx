type Props = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

export function Toggle({ label, checked, onChange }: Props) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--color-border)] bg-white/60 p-3">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[color:var(--color-gold)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
