import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export function Pagination({ count, page, onChange, pageSize = 10 }: { count: number; page: number; onChange: (page: number) => void; pageSize?: number }) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pageCount - 1);
  return <div className="pagination"><span>{count ? current * pageSize + 1 : 0}–{Math.min((current + 1) * pageSize, count)} de {count}</span><Button aria-label="Página anterior" disabled={current === 0} onClick={() => onChange(current - 1)}><ChevronLeft size={16} /></Button><span className="page-number">{current + 1} / {pageCount}</span><Button aria-label="Página siguiente" disabled={current + 1 >= pageCount} onClick={() => onChange(current + 1)}><ChevronRight size={16} /></Button></div>;
}
