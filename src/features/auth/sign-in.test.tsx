import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQaTeamClient } from "../../lib/team/api-client";
vi.mock("../../lib/team/api-client", async () => ({ ...await vi.importActual<typeof import("../../lib/team/api-client")>("../../lib/team/api-client"), createQaTeamClient: vi.fn() }));
import { App } from "../../app/App";
import { getCurrentUser, readRepository } from "../../lib/bitbucket/reader";
import { defaultPreferences, loadPreferences, savePreferences } from "../../lib/storage/indexed-db";
import { demoDataset } from "../pull-requests/services/fixtures";
import { clearSession, sessionExpiresAt, readSession, saveSession } from "./services/session-storage";

vi.mock("../../lib/bitbucket/reader", () => ({ getCurrentUser: vi.fn(), readRepository: vi.fn() }));
const owner = demoDataset.currentUser.accountId;

beforeEach(async () => {
  vi.mocked(createQaTeamClient).mockReturnValue({ read: vi.fn().mockResolvedValue({ members: [{ accountId: "qa-javier", displayName: "Javier Mejías" }, { accountId: "qa-ivan", displayName: "Iván Reyes" }], revision: "initial", updatedAt: null, canEdit: true }), save: vi.fn(async (members) => ({ members, revision: "new", updatedAt: new Date().toISOString(), canEdit: true })) });
  vi.clearAllMocks(); clearSession();
  await savePreferences({ ...defaultPreferences, ignoredPullRequestKeys: ["private#42"] });
  await savePreferences({ ...defaultPreferences, qaAccountIds: ["qa-javier", "qa-ivan"] }, owner);
  vi.mocked(getCurrentUser).mockResolvedValue(demoDataset.currentUser);
  vi.mocked(readRepository).mockImplementation(async (_client, repo) => demoDataset.pullRequests.filter((pr) => pr.repository.slug === repo.slug));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); });

async function fillCredentials() {
  await userEvent.type(await screen.findByLabelText("Correo de Atlassian"), "test@example.com");
  await userEvent.type(screen.getByLabelText("API token", { exact: true }), "test-token");
}

describe("mandatory sign-in", () => {
  it("shows no demo, PR, navigation, search or notifications before login", async () => {
    render(<App />);
    await screen.findByLabelText("Correo de Atlassian");
    expect(screen.getByRole("heading", { level: 1, name: "Conecta tu espacio de código." })).toBeVisible();
    expect(screen.queryByText(/Tu espacio de revisión|Conecta tu cuenta para empezar\.|Inicia sesión con Bitbucket y elige/)).not.toBeInTheDocument();
    expect(screen.getByText("Sesión guardada en este navegador durante 12 horas desde que inicias sesión.")).toBeVisible();
    expect(screen.queryByText(/00:00 de Santiago|medianoche de Santiago/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignorados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Buscar por título o PR")).not.toBeInTheDocument();
    expect(screen.queryByText(/Modo demostración|Datos de ejemplo|Retry failed provider/)).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(readRepository).not.toHaveBeenCalled();
  });

  it("requires an explicit perspective before verifying credentials", async () => {
    render(<App />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Conectar con Bitbucket" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Selecciona si revisarás como QA");
    expect(screen.getByRole("radio", { name: "QA" })).toHaveFocus();
    expect(screen.getByRole("radiogroup", { name: "Tu perspectiva" })).toHaveAttribute("aria-invalid", "true");
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("unlocks the app only after verified login, and disconnects back to an empty sign-in", async () => {
    let finish = () => {};
    vi.mocked(getCurrentUser).mockReturnValueOnce(new Promise((resolve) => { finish = () => resolve(demoDataset.currentUser); }));
    render(<App />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("radio", { name: "QA" }));
    await userEvent.click(screen.getByRole("button", { name: "Conectar con Bitbucket" }));
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(readRepository).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await screen.findByText("3 resultados");
    expect(screen.getByRole("button", { name: "Ignorados" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("button", { name: "Desconectar cuenta" }));
    await screen.findByLabelText("Correo de Atlassian");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Javier Mejías")).not.toBeInTheDocument();
    expect(screen.queryByText(/Retry failed provider/)).not.toBeInTheDocument();
    expect(readSession().status).toBe("none");
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("uses the selected developer perspective rather than silently defaulting to QA", async () => {
    render(<App />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("radio", { name: "Desarrollador" }));
    await userEvent.click(screen.getByRole("button", { name: "Conectar con Bitbucket" }));
    await screen.findByText("1 resultados");
    expect(screen.getAllByRole("button", { name: "Expose provider retry metrics" })[0]).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ignorados" })).not.toBeInTheDocument();
    expect((await loadPreferences(owner)).role).toBe("developer");
  });

  it("keeps the app blocked on authentication failure and permits a retry", async () => {
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error("Invalid credentials"));
    render(<App />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("radio", { name: "Observador" }));
    await userEvent.click(screen.getByRole("button", { name: "Conectar con Bitbucket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo verificar la cuenta");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(readSession().status).toBe("none");
    expect(readRepository).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Conectar con Bitbucket" }));
    await screen.findByText("4 resultados");
    expect((await loadPreferences(owner)).role).toBe("observer");
    expect(screen.queryByRole("button", { name: "Ignorados" })).not.toBeInTheDocument();
  });

  it("hides all account content while restoring and when the session expires", async () => {
    const createdAt = Date.now();
    saveSession({ version: 2, email: "test@example.com", token: "test-token", createdAt, expiresAt: sessionExpiresAt(createdAt) });
    let finish = () => {};
    vi.mocked(getCurrentUser).mockReturnValueOnce(new Promise((resolve) => { finish = () => resolve(demoDataset.currentUser); }));
    render(<App />);
    expect(screen.getByRole("status", { name: "Recuperando sesión" })).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Correo de Atlassian")).not.toBeInTheDocument();
    await act(async () => { finish(); });
    await screen.findByText("3 resultados");
    vi.spyOn(Date, "now").mockReturnValue(sessionExpiresAt(createdAt) + 1);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await screen.findByLabelText("Correo de Atlassian");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión venció");
    await waitFor(() => expect(readSession().status).toBe("none"));
  });
});
