export type UpdateState = { phase: "idle" | "ready" | "applying" | "error"; message?: string };
let state: UpdateState = { phase: "idle" };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let updateTimeout: number | undefined;

function publish(next: UpdateState) { state = next; listeners.forEach((listener) => listener()); }
export function getUpdateState(): UpdateState { return state; }
export function subscribeToUpdates(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

export async function applyUpdate(): Promise<void> {
  const current = registration;
  if (!current || state.phase === "applying") return;
  publish({ phase: "applying" });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Update timed out")), 30000);
      current.update().then(() => { window.clearTimeout(timer); resolve(); }, (error: unknown) => { window.clearTimeout(timer); reject(error); });
    });
    if (current.installing) {
      const worker = current.installing;
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => { worker.removeEventListener("statechange", check); reject(new Error("Install timed out")); }, 30000);
        function check() {
          if (worker.state !== "installed" && worker.state !== "redundant") return;
          window.clearTimeout(timer); worker.removeEventListener("statechange", check);
          if (worker.state === "installed") resolve(); else reject(new Error("Install failed"));
        }
        worker.addEventListener("statechange", check); check();
      });
    }
    const worker = current.waiting;
    if (!worker) throw new Error("No waiting update");
    worker.postMessage({ type: "SKIP_WAITING" });
    updateTimeout = window.setTimeout(() => publish({ phase: "error", message: "La actualización no pudo completarse. Revisa tu conexión y vuelve a intentarlo." }), 15000);
  } catch {
    publish({ phase: "error", message: "No se pudo descargar la actualización. Puedes seguir usando esta versión y reintentar." });
  }
}

export function registerServiceWorker(reload = () => window.location.reload()): () => void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return () => {};
  const container = navigator.serviceWorker;
  let controlled = Boolean(container.controller);
  let refreshing = false;
  let stopped = false;
  let registering = false;
  let lastCheck = 0;
  const check = () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    if (!registration) { start(); return; }
    void registration?.update().catch(() => {});
  };
  const onControllerChange = () => {
    if (!controlled) { controlled = true; return; }
    if (refreshing) return;
    refreshing = true;
    window.clearTimeout(updateTimeout);
    reload();
  };
  container.addEventListener("controllerchange", onControllerChange);
  document.addEventListener("visibilitychange", check);
  window.addEventListener("online", check);
  function start() {
    if (registering || stopped) return;
    registering = true;
    void container.register("/sw.js", { updateViaCache: "none" }).then((value) => {
      if (stopped) return;
      registration = value;
      const offer = () => {
        if (value.waiting && container.controller && state.phase !== "applying") publish({ phase: "ready" });
      };
      const watch = () => {
        const worker = value.installing;
        if (worker) worker.addEventListener("statechange", offer);
        offer();
      };
      value.addEventListener("updatefound", watch);
      watch(); check();
    }).catch(() => {}).finally(() => { registering = false; });
  }
  start();
  const timer = window.setInterval(check, 60000);
  return () => {
    stopped = true; window.clearInterval(timer); window.clearTimeout(updateTimeout);
    container.removeEventListener("controllerchange", onControllerChange);
    document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check);
  };
}
