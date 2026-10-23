import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/Button";

export interface DetailNavigationProps {
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function DetailNavigation({ onPrevious, onNext, position, onRefresh, refreshing }: DetailNavigationProps) {
  return <nav className="detail-navigation" aria-label="Navegar pull requests"><Button variant="ghost" onClick={onPrevious} disabled={!onPrevious} aria-label="PR anterior"><ChevronLeft size={16} />Anterior</Button><span>{position}</span><Button variant="ghost" onClick={onNext} disabled={!onNext} aria-label="PR siguiente">Siguiente<ChevronRight size={16} /></Button>{onRefresh && <button className="icon-button" aria-label="Actualizar seguimiento" title="Actualizar seguimiento" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>}</nav>;
}
