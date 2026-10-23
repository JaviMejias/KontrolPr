export function TableSkeleton({ rows = 5, label = "Cargando pull requests", variant = "table" }: { rows?: number; label?: string; variant?: "table" | "directory" }) {
  return <section className={`table-skeleton skeleton-${variant}`} role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="skeleton-heading" aria-hidden="true"><span className="skeleton-block skeleton-title" /><span className="skeleton-block skeleton-pill" /></div>
    <div aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index}>
      <span className="skeleton-block skeleton-avatar" /><div className="skeleton-lines"><span className="skeleton-block skeleton-line" /><span className="skeleton-block skeleton-line-short" /></div><span className="skeleton-block skeleton-pill" /><span className="skeleton-block skeleton-switch" />
    </div>)}</div>
  </section>;
}
