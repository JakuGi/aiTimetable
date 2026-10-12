import { SWATCHES } from '../lib/meta';

interface Props {
  value: string | null;
  onChange: (c: string | null) => void;
  allowNone?: string; // label for "use default"
  label: string;
}

export function ColorSwatches({ value, onChange, allowNone, label }: Props) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className="swatch swatch-none"
          onClick={() => onChange(null)}
          title={allowNone}
        >
          <span className="sr-only">{allowNone}</span>
        </button>
      )}
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value?.toUpperCase() === c}
          className="swatch"
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        >
          <span className="sr-only">{c}</span>
        </button>
      ))}
      <label className="swatch swatch-custom" title="Vlastná farba">
        <input
          type="color"
          value={value ?? '#2B4BDB'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="Vlastná farba"
        />
      </label>
    </div>
  );
}
