import type { CSSProperties, ReactNode } from 'react';
import { useData } from '../lib/data';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function CategorySelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { categories } = useData();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Bez kategórie</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          style={o.color ? ({ '--c': o.color } as CSSProperties) : undefined}
          className={o.color ? 'has-color' : undefined}
        >
          {o.color && <i className="dot" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
