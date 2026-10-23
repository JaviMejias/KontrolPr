import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import type { QaTeamState } from "../useSharedQaTeam";

export function QaTeamNotice({ state, onRefresh }: { state: QaTeamState; onRefresh: () => Promise<unknown> }) {
  if (state.status !== "error") return null;
  return <div className="session-notice" role="alert"><ShieldAlert size={18} /><span>{state.message} {state.snapshot ? "Los estados usan el último equipo verificado." : "Los PR se consultarán cuando pueda verificarse el equipo QA compartido."}</span><Button onClick={() => void onRefresh()}><RefreshCw size={15} />Reintentar equipo QA</Button></div>;
}
