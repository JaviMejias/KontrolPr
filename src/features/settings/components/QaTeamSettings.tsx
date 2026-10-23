import { useRef, useState } from "react";
import { LockKeyhole, Plus, RefreshCw, ShieldCheck, Undo2, UserMinus } from "lucide-react";
import type { Person } from "../../../types/domain";
import { personMatches } from "../../../lib/review-revision";
import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { PanelHeading } from "../../../components/ui/PanelHeading";
import { PersonSelect } from "../../../components/ui/PersonSelect";
import type { QaTeamState } from "../useSharedQaTeam";

export interface QaTeamControls {
  qaTeamState?: QaTeamState;
  onSaveQaTeam?: (members: Person[]) => Promise<boolean>;
  onRefreshQaTeam?: () => Promise<unknown>;
}

const signature = (members: Person[]) => members.map((person) => person.accountId).sort().join("|");

function QaTeamHeading({ state }: { state: QaTeamState }) {
  return <PanelHeading icon={ShieldCheck} title="QA del equipo" description="Una lista compartida para todos. Sin un número obligatorio de QA." tone="blue" accessory={<span className="soft-tag tone-blue">{state.snapshot ? `${state.snapshot.members.length} QA` : "Consultando…"}</span>} />;
}

function QaTeamErrorNotice({ state }: { state: QaTeamState }) {
  if (!state.message) return null;
  return <p className="session-notice" role="alert">{state.message}{state.snapshot && " Se conserva la última lista verificada. Actualízala antes de editar."}</p>;
}

function QaTeamList({ state, editable, onRemove }: { state: QaTeamState; editable: boolean; onRemove: (person: Person) => void }) {
  const snapshot = state.snapshot;
  if (!snapshot) return <p className="qa-team-empty" role="status">{state.status === "loading" ? "Verificando el equipo compartido…" : "El equipo compartido todavía no está disponible. Reintenta la consulta."}</p>;
  if (!snapshot.members.length) return <p className="qa-team-empty">No hay QA configurados.{snapshot.canEdit ? " Añade las personas que revisan al equipo." : " Javier puede configurar las personas que revisan al equipo."}</p>;
  return <ul className="qa-member-list" aria-label="QA configurados">{snapshot.members.map((person) => <li className="qa-member-row" key={person.accountId}><Avatar person={person} /><div><strong>{person.displayName}</strong>{person.nickname && <small>@{person.nickname}</small>}</div>{snapshot.canEdit && <Button disabled={!editable} aria-label={`Quitar a ${person.displayName} del equipo QA`} onClick={() => onRemove(person)}><UserMinus size={16} /><span>Quitar</span></Button>}</li>)}</ul>;
}

export function QaTeamSettings({ people, loading = false, qaTeamState = { status: "idle" }, onSaveQaTeam, onRefreshQaTeam }: QaTeamControls & { people: Person[]; loading?: boolean }) {
  const [candidate, setCandidate] = useState("");
  const [removed, setRemoved] = useState<{ person: Person; signature: string }>();
  const [message, setMessage] = useState("");
  const composer = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const team = qaTeamState.snapshot?.members ?? [];
  const canEdit = qaTeamState.snapshot?.canEdit === true;
  const busy = ["loading", "refreshing", "saving"].includes(qaTeamState.status);
  const editable = canEdit && qaTeamState.status === "ready" && Boolean(onSaveQaTeam);
  const selectedIds = new Set(team.flatMap((person) => [person.accountId, person.uuid, person.atlassianAccountId].filter((id): id is string => Boolean(id))));
  const available = [...new Map(people.map((person) => [person.accountId, person])).values()].filter((person) => !personMatches(person, selectedIds)).sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  const selected = available.find((person) => person.accountId === candidate);
  const commit = async (members: Person[], person: Person, removing = false) => {
    if (!editable || pending.current || !onSaveQaTeam) return;
    pending.current = true; setMessage("");
    try {
      if (!await onSaveQaTeam(members)) return;
      setRemoved(removing ? { person, signature: signature(members) } : undefined);
      if (!removing) setCandidate("");
      setMessage(`${person.displayName} ${removing ? "quitado del" : "añadido al"} equipo QA. Guardado para todos.`);
      composer.current?.querySelector("button")?.focus({ preventScroll: true });
    } finally { pending.current = false; }
  };
  return <section className="settings-card qa-team-panel" aria-busy={busy}>
    <QaTeamHeading state={qaTeamState} />
    <p className="qa-team-help"><LockKeyhole size={14} /> Solo Javier Mejías puede modificar esta lista. Elegir la perspectiva QA no concede permisos de edición.</p>
    {onRefreshQaTeam && <Button disabled={busy} onClick={() => { setMessage(""); void onRefreshQaTeam(); }}><RefreshCw size={15} />{qaTeamState.status === "refreshing" ? "Actualizando equipo…" : "Actualizar equipo QA"}</Button>}
    <QaTeamErrorNotice state={qaTeamState} />
    {canEdit && <div className="qa-team-composer" ref={composer}><PersonSelect label="Añadir persona al equipo QA" people={available} value={candidate} onChange={setCandidate} loading={loading} /><Button disabled={!editable || !selected} aria-busy={qaTeamState.status === "saving"} onClick={() => { if (selected) void commit([...team, selected], selected); }}><Plus size={16} />Añadir QA</Button></div>}
    <QaTeamList state={qaTeamState} editable={editable} onRemove={(person) => void commit(team.filter((member) => member.accountId !== person.accountId), person, true)} />
    <div className="qa-team-feedback"><p role="status">{qaTeamState.status === "saving" ? "Guardando el equipo compartido…" : message}</p>{canEdit && removed && removed.signature === signature(team) && !personMatches(removed.person, selectedIds) && <Button disabled={!editable} onClick={() => void commit([...team, removed.person], removed.person)}><Undo2 size={15} />Deshacer</Button>}</div>
    <p className="panel-footnote">Los cambios confirmados se comparten al actualizar el equipo, sincronizar o volver a entrar. No modifican permisos de Bitbucket.</p>
  </section>;
}
