import { LoaderCircle, LockKeyhole } from "lucide-react";
import type { UserRole } from "../../../types/domain";
import { ConnectionSettings } from "../../settings/components/ConnectionSettings";

export function SignInView({ loading, notice, onConnect }: { loading: boolean; notice: string; onConnect: (email: string, token: string, role: UserRole) => Promise<void> }) {
  return <main className="sign-in-page">
    <header className="sign-in-header"><div className="brand-lockup"><span className="brand-mark">K</span><span><strong>KontrolPR</strong><small>Pull Request Monitor</small></span></div><span className="soft-tag tone-blue"><LockKeyhole size={13} />Acceso personal</span></header>
    {notice && <div className="session-notice" role="status">{notice}</div>}
    {loading ? <div className="session-restoration" role="status" aria-label="Recuperando sesión"><LoaderCircle size={24} className="spin" /><h1>Recuperando tu sesión…</h1><p>Estamos verificando tu cuenta antes de mostrar tus repositorios.</p></div> : <ConnectionSettings connected={false} onConnect={onConnect} onDisconnect={() => {}} />}
  </main>;
}
