import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, CircleCheck, Eye, EyeOff, Fingerprint, GitPullRequest, KeyRound, Link2, LoaderCircle, LockKeyhole, LogOut, Mail, ShieldCheck } from "lucide-react";
import type { Person, UserRole } from "../../../types/domain";
import { Button } from "../../../components/ui/Button";
import { Avatar } from "../../../components/ui/Avatar";
import { PerspectiveSettings } from "./PerspectiveSettings";

export function ConnectionSettings({ user, connected, onConnect, onDisconnect }: { user?: Person; connected: boolean; onConnect: (email: string, token: string, role: UserRole) => Promise<void>; onDisconnect: () => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [perspective, setPerspective] = useState<UserRole>();
  const [perspectiveInvalid, setPerspectiveInvalid] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  return <section className={`connection-surface ${connected ? "is-connected" : ""}`}>
    <div className="connection-main">
      <div className="connection-brand"><span className="connection-logo"><GitPullRequest size={25} /></span><span>BITBUCKET CLOUD<small>Tu código. Tu cuenta.</small></span><span className={`soft-tag tone-${connected ? "lime" : "blue"}`}><span className="status-dot" />{connected ? "Conectado" : "Sin conectar"}</span></div>
      {connected ? <div className="connected-account"><div className="connected-avatar"><Avatar person={user ?? { accountId: "", displayName: "Bitbucket" }} size="lg" /><span><CircleCheck size={16} /></span></div><h3>{user?.displayName ?? "Tu cuenta de Bitbucket"}</h3><p>Tu espacio está listo para seguir los PR de tu equipo.</p><span className="soft-tag tone-lime"><ShieldCheck size={13} />Identidad verificada en Bitbucket</span><Button className="disconnect-button" onClick={onDisconnect}><LogOut size={16} />Desconectar cuenta</Button></div> : <>
        <div className="connection-copy"><h1>Conecta tu espacio de código.</h1><p>Los cambios de tus repositorios, reunidos en una sola bandeja.</p></div>
        <form className="connection-form" ref={formRef} noValidate onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Introduce un correo de Atlassian válido."); emailRef.current?.focus(); return; }
          if (!token.trim()) { setError("Introduce tu API token de Bitbucket."); tokenRef.current?.focus(); return; }
          if (!perspective) { setError("Selecciona si revisarás como QA, desarrollador u observador."); setPerspectiveInvalid(true); formRef.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus(); return; }
          setPending(true); setError("");
          try { await onConnect(email.trim(), token.trim(), perspective); setToken(""); } catch { setError("No se pudo verificar la cuenta. Revisa el correo, el token, sus permisos y tu conexión."); } finally { setPending(false); }
        }}>
          <label htmlFor="connection-email">Correo de Atlassian</label><div className="icon-input"><Mail size={18} /><input ref={emailRef} id="connection-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu.nombre@empresa.cl" required aria-describedby={error ? "connection-error" : undefined} /></div>
          <div className="field-label-row"><label htmlFor="api-token">API token</label><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Crear un token<ArrowUpRight size={13} /></a></div>
          <div className="icon-input"><KeyRound size={18} /><input ref={tokenRef} id="api-token" type={showToken ? "text" : "password"} autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Tu token de lectura" required aria-describedby={error ? "connection-error" : undefined} /><button type="button" aria-pressed={showToken} aria-label={showToken ? "Ocultar API token" : "Mostrar API token"} onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          <PerspectiveSettings value={perspective} disabled={pending} invalid={perspectiveInvalid} required onChange={(role) => { setPerspective(role); setPerspectiveInvalid(false); setError(""); }} />
          <div className="connection-error-slot">{error && <p id="connection-error" className="form-error" role="alert">{error}</p>}</div>
          <Button variant="primary" type="submit" disabled={pending} aria-busy={pending} className="connect-button">{pending ? <LoaderCircle size={17} className="spin" /> : <Link2 size={17} />}{pending ? "Verificando…" : "Conectar con Bitbucket"}<ArrowRight size={16} /></Button>
          <span className="private-note"><LockKeyhole size={13} />Sesión guardada en este navegador durante 12 horas desde que inicias sesión.</span>
        </form>
      </>}
    </div>
    <aside className="connection-aside"><span className="permission-symbol"><ShieldCheck size={29} strokeWidth={1.5} /><span /></span><span className="eyebrow">Acceso personal</span><h4>Solo lo necesario.<br /> Solo lectura.</h4><p>KontrolPR consulta tus repositorios con los permisos de tu cuenta.</p><div className="permission-list">{[{ icon: Fingerprint, label: "Identificar tu cuenta", scope: "read:user:bitbucket" }, { icon: GitPullRequest, label: "Consultar repositorios", scope: "read:repository:bitbucket" }, { icon: CheckCheck, label: "Leer PR y comentarios", scope: "read:pullrequest:bitbucket" }, { icon: Fingerprint, label: "Consultar miembros del workspace", scope: "read:workspace:bitbucket" }].map((permission) => { const Icon = permission.icon; return <div key={permission.scope}><span><Icon size={17} /></span><div><strong>{permission.label}</strong><code>{permission.scope}</code></div></div>; })}</div>
      <details className="token-guide"><summary>Cómo crear tu API token<ArrowUpRight size={14} /></summary><ol><li>En Seguridad de tu cuenta Atlassian, elige <strong>Crear token de API con alcances</strong>.</li><li>Ponle un nombre, define la fecha de expiración y selecciona <strong>Bitbucket</strong>. El máximo es un año.</li><li>Activa únicamente los cuatro permisos <strong>Read</strong> indicados arriba y crea el token. Workspace Read permite cargar personas aunque no hayan participado en PR.</li><li>Cópialo en este formulario: Atlassian lo muestra una sola vez. Por defecto vence en un año; puedes elegir entre 1 y 365 días.</li></ol></details>
      <div className="connection-session-note"><LockKeyhole size={16} /><p>F5 conserva tu sesión sin reiniciar el plazo de 12 horas. El token se guarda localmente y es accesible al código de este sitio. Desconectar elimina la credencial guardada; no revoca el token en Atlassian.</p></div></aside>
  </section>;
}
