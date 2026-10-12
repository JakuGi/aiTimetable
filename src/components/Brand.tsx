export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <img src="/icon.svg" alt="" width={28} height={28} />
      {!compact && <span className="brand-name">Rozvrh</span>}
    </span>
  );
}
