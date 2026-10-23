import { FileCode2 } from "lucide-react";
import type { PullRequestViewModel } from "../../../types/domain";

export function ReviewEvidenceCard({ pullRequest }: { pullRequest: PullRequestViewModel }) {
  const approved = pullRequest.flowState === "QA_APPROVED";
  const changed = pullRequest.hasEffectiveCodeChange;
  const title = approved ? "Aprobación vigente" : changed ? "Cambios de contenido verificados" : "Sin conclusión de contenido";
  const explanation = pullRequest.flowState === "COMMITS_PENDING" ? "Comparación histórica no concluyente" : approved ? "La aprobación corresponde al contenido observado" : changed ? "Contenido diferente al de la última revisión; no implica corrección" : "Un comentario o un commit no equivale a una aprobación";
  return <div><span className="detail-label"><FileCode2 size={12} />Evidencia de revisión</span><strong>{title}</strong>{pullRequest.sourceHash && <small className="mono-text">Versión {pullRequest.sourceHash.slice(0, 12)}</small>}<small>{explanation}</small></div>;
}
