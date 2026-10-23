import { TableSkeleton } from "./TableSkeleton";

export function ViewSkeleton({ label, variant = "overview" }: { label: string; variant?: "overview" | "directory" }) {
  return <div className="view-skeleton" aria-busy="true">
    <div className={`skeleton-stats ${variant === "overview" ? "summary-grid" : "skeleton-directory-tabs"}`} aria-hidden="true">{Array.from({ length: variant === "overview" ? 4 : 2 }, (_, index) => <div className="skeleton-stat" key={index}><span className="skeleton-block skeleton-avatar" /><div className="skeleton-lines"><span className="skeleton-block skeleton-line" /><span className="skeleton-block skeleton-line-short" /></div></div>)}</div>
    <div className="skeleton-filters" aria-hidden="true"><span className="skeleton-block skeleton-title" /><span className="skeleton-block skeleton-pill" /></div>
    <TableSkeleton label={label} variant={variant === "overview" ? "table" : "directory"} />
  </div>;
}
