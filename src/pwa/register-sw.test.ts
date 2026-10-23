import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let stop = () => {};
beforeEach(() => { vi.resetModules(); vi.stubEnv("PROD", true); vi.useFakeTimers(); });
afterEach(() => { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup(controlled = true, waiting = true, failFirstRegistration = false) {
  const worker = Object.assign(new EventTarget(), { state: "installed", postMessage: vi.fn() });
  const registration = Object.assign(new EventTarget(), { waiting: waiting ? worker : null, installing: null, update: vi.fn().mockResolvedValue(undefined) });
  const container = Object.assign(new EventTarget(), { controller: controlled ? {} : null, register: vi.fn().mockResolvedValue(registration) });
  if (failFirstRegistration) container.register.mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("navigator", { serviceWorker: container });
  const reload = vi.fn();
  const service = await import("./register-sw");
  stop = service.registerServiceWorker(reload);
  await Promise.resolve(); await Promise.resolve();
  return { service, reload, worker, container, registration };
}

describe("PWA update lifecycle", () => {
  it("retries initial registration after a transient failure", async () => {
    const { service, container } = await setup(true, true, true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(container.register).toHaveBeenCalledTimes(2);
    expect(service.getUpdateState().phase).toBe("ready");
  });
  it("offers retry when checking a new version times out", async () => {
    const { service, registration, worker } = await setup();
    registration.update.mockReturnValueOnce(new Promise(() => {}));
    const applying = service.applyUpdate();
    await vi.advanceTimersByTimeAsync(30000); await applying;
    expect(service.getUpdateState().phase).toBe("error");
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
  it("offers a waiting version without activating or reloading it", async () => {
    const { service, container, worker, reload } = await setup();
    expect(container.register).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" });
    expect(service.getUpdateState().phase).toBe("ready");
    expect(worker.postMessage).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
  });
  it("activates only on request and reloads once after controller change", async () => {
    const { service, worker, container, reload } = await setup();
    await service.applyUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange")); container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("does not reload on first installation", async () => {
    const { container, reload, service } = await setup(false, false);
    container.controller = {};
    container.dispatchEvent(new Event("controllerchange"));
    expect(service.getUpdateState().phase).toBe("idle"); expect(reload).not.toHaveBeenCalled();
  });
  it("keeps the old version usable after an update failure and supports retry", async () => {
    const { service, registration, worker } = await setup();
    registration.update.mockRejectedValueOnce(new Error("offline"));
    await service.applyUpdate();
    expect(service.getUpdateState().phase).toBe("error"); expect(worker.postMessage).not.toHaveBeenCalled();
    await service.applyUpdate();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });
  it("checks again each minute and offers updates discovered after startup", async () => {
    const { registration, service, worker } = await setup(true, false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(registration.update).toHaveBeenCalledTimes(2);
    registration.waiting = worker;
    registration.dispatchEvent(new Event("updatefound"));
    expect(service.getUpdateState().phase).toBe("ready");
  });
});
