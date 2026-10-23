import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQaTeamClient } from "../../lib/team/api-client";
vi.mock("../../lib/team/api-client", async () => ({ ...await vi.importActual<typeof import("../../lib/team/api-client")>("../../lib/team/api-client"), createQaTeamClient: vi.fn() }));
import { App } from "../../app/App";
import { defaultPreferences, loadPreferences, savePreferences } from "../../lib/storage/indexed-db";
import { clearSession, sessionExpiresAt, saveSession } from "../auth/services/session-storage";
import { RepositorySettings } from "./components/RepositorySettings";
import { IgnoredView } from "./components/IgnoredView";
import { ConnectionSettings } from "./components/ConnectionSettings";
import { demoDataset } from "../pull-requests/services/fixtures";
import { getCurrentUser, readRepository } from "../../lib/bitbucket/reader";
import { BitbucketApiError } from "../../lib/bitbucket/contracts";

vi.mock("../../lib/bitbucket/reader", () => ({ getCurrentUser: vi.fn(), readRepository: vi.fn() }));
vi.mock("../../lib/bitbucket/directory", () => ({ readTeamDirectory: vi.fn().mockResolvedValue([]) }));
const owner = demoDataset.currentUser.accountId;
const accountPreferences = { ...defaultPreferences, qaAccountIds: ["qa-javier", "qa-ivan"] };

beforeEach(async () => {
  vi.mocked(createQaTeamClient).mockReturnValue({ read: vi.fn().mockResolvedValue({ members: [{ accountId: "qa-javier", displayName: "Javier Mejías" }, { accountId: "qa-ivan", displayName: "Iván Reyes" }], revision: "initial", updatedAt: null, canEdit: true }), save: vi.fn(async (members) => ({ members, revision: "new", updatedAt: new Date().toISOString(), canEdit: true })) });
  vi.clearAllMocks(); clearSession();
  await savePreferences({ ...accountPreferences }, owner);
  vi.mocked(getCurrentUser).mockResolvedValue(demoDataset.currentUser);
  vi.mocked(readRepository).mockImplementation(async (_client, repository) => demoDataset.pullRequests.filter((pr) => pr.repository.slug === repository.slug));
  const createdAt = Date.now();
  saveSession({ version: 2, email: "test@example.com", token: "test-token", createdAt, expiresAt: sessionExpiresAt(createdAt) });
});
afterEach(() => { cleanup(); clearSession(); });

async function showAllActivity() {
  await userEvent.click(await screen.findByRole("button", { name: /^Actividad:/ }));
  await userEvent.click(screen.getByRole("radio", { name: "Cualquier actividad" }));
}

describe("monitor settings", () => {
  it("restores role filters and author scope after remount without persisting the search query", async () => {
    const first = render(<App />); await screen.findByText("3 resultados");
    await showAllActivity();
    await userEvent.click(screen.getByRole("button", { name: "Autores: Todos los autores" }));
    await userEvent.click(screen.getByRole("switch", { name: "Ana Torres" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByLabelText("Buscar por título o PR"), "health");
    expect((await loadPreferences(owner)).overviewByRole?.qa?.filters.authors).toEqual(["dev-ana"]);
    first.unmount();
    render(<App />); await screen.findByText("2 resultados");
    expect(screen.getByLabelText("Buscar por título o PR")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Actividad: Cualquier actividad" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Autores: 1 autores seleccionados" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("radio", { name: "Desarrollador" }));
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(screen.getByRole("button", { name: "Actividad: Requiere atención" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Autores: Todos los autores" })).toBeVisible();
    await userEvent.click(screen.getByRole("switch", { name: "Ver PR de todos los autores" }));
    expect((await loadPreferences(owner)).overviewByRole?.developer?.allAuthors).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("radio", { name: "QA" }));
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(screen.getByRole("button", { name: "Autores: 1 autores seleccionados" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect((await loadPreferences(owner)).overviewByRole?.qa).toMatchObject({ filters: { activity: "attention", authors: [] }, summary: "", allAuthors: false });
    expect((await loadPreferences(owner)).overviewByRole?.developer?.allAuthors).toBe(true);
  });
  it("restores a visible summary selection and toggles it off without leaving an invisible filter", async () => {
    const first = render(<App />); await screen.findByText("3 resultados");
    await userEvent.click(screen.getByRole("button", { name: /Actualizados/ }));
    expect(screen.getByText("1 resultados")).toBeVisible();
    first.unmount(); render(<App />);
    await screen.findByText("1 resultados");
    expect(screen.getByRole("button", { name: /Actualizados/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Actualizados/ }));
    expect(screen.getByRole("button", { name: /Actualizados/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 resultados")).toBeVisible();
  });
  it("refreshes the open detail, navigates its original filtered queue and restores focus", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    render(<App />);
    await screen.findByText("3 resultados");
    const trigger = screen.getAllByRole("button", { name: "Retry failed provider requests with bounded backoff" })[0];
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Detalle de seguimiento" });
    expect(within(dialog).getByText("1 de 3")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "PR anterior" })).toBeDisabled();
    vi.mocked(readRepository).mockImplementation(async (_client, repository) => demoDataset.pullRequests.filter((pr) => pr.repository.slug === repository.slug).map((pr) => pr.id !== 184 ? pr : { ...pr, title: "Título actualizado", comments: [...pr.comments, { id: 999, author: pr.author, createdAt: "2026-10-22T14:00:00Z", content: "Comentario recién sincronizado", inline: false, link: "#" }] }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Actualizar seguimiento" }));
    expect(await within(dialog).findByText("Comentario recién sincronizado")).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "Título actualizado" })).toBeVisible();
    expect(screen.getByRole("dialog")).toBe(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "PR siguiente" }));
    expect(within(dialog).getByText("2 de 3")).toBeVisible();
    expect(within(dialog).queryByText("Comentario recién sincronizado")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "PR siguiente" }));
    expect(within(dialog).getByText("3 de 3")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "PR siguiente" })).toBeDisabled();
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar detalle" })[1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("removes an open detail after its repository returns 403", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    render(<App />); await screen.findByText("3 resultados");
    await userEvent.click(screen.getAllByRole("button", { name: "Retry failed provider requests with bounded backoff" })[0]);
    vi.mocked(readRepository).mockRejectedValue(new BitbucketApiError(403, "Forbidden", "forbidden"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Actualizar seguimiento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/El PR seleccionado ya no está disponible/)).toBeVisible();
    expect(screen.queryByText("Avoids duplicate provider calls when a downstream service is slow.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByText(/El PR seleccionado ya no está disponible/)).not.toBeInTheDocument();
  });
  it("mounts the overview entry surface on navigation without remounting it for filtering or sync", async () => {
    render(<App />);
    await screen.findByText("3 resultados");
    const overview = () => screen.getByRole("heading", { name: "La siguiente acción, clara." }).closest(".overview-view");
    const initial = overview();
    expect(initial).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Buscar por título o PR"), "retry");
    expect(overview()).toBe(initial);
    await userEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeEnabled());
    expect(overview()).toBe(initial);
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    expect(initial).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(overview()).toBeInTheDocument();
    expect(overview()).not.toBe(initial);
    const returned = overview();
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(overview()).not.toBe(returned);
  });
  it("defaults QA to its own pending actions and excludes developer feedback", async () => {
    render(<App />);
    await screen.findByText("3 resultados");
    expect(screen.getByRole("button", { name: "Actividad: Requiere atención" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Expose provider retry metrics" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nuevos aquí")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Actividad:/ }));
    expect(screen.queryByText("Nueva en este dispositivo")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Cualquier actividad" }));
    expect(screen.getByText("4 resultados")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Expose provider retry metrics" })[0]).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByText("3 resultados")).toBeVisible();
  });

  it("defaults developers to their own QA feedback and observers to the complete active list", async () => {
    render(<App />);
    await screen.findByText("3 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("radio", { name: "Desarrollador" }));
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(screen.getByRole("button", { name: "Actividad: Requiere atención" })).toBeVisible();
    expect(screen.getByText("1 resultados")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Expose provider retry metrics" })[0]).toBeVisible();
    expect(screen.queryByRole("button", { name: "Normalize provider timeout errors" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("radio", { name: "Observador" }));
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(screen.getByRole("button", { name: "Actividad: Cualquier actividad" })).toBeVisible();
    expect(screen.getByText("4 resultados")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^Actividad:/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Requiere atención" }));
    expect(screen.getByText("4 resultados")).toBeVisible();
  });

  it("opens Resumen from settings with Ctrl+K and filters the actual PR list", async () => {
    render(<App />);
    await showAllActivity();
    await screen.findByText("4 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Configuración" }));
    await userEvent.keyboard("{Control>}k{/Control}");
    const search = screen.getByLabelText("Buscar por título o PR");
    expect(search).toHaveFocus();
    await userEvent.type(search, "timeout");
    expect(screen.getByText("1 resultados")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Normalize provider timeout errors" })[0]).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(screen.getByText("4 resultados")).toBeVisible();
    expect(search).toHaveFocus();
  });

  it("opens Resumen when activating search by mouse from Ignorados", async () => {
    render(<App />);
    await showAllActivity();
    await screen.findByText("4 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    await userEvent.click(screen.getByLabelText("Buscar por título o PR"));
    expect(screen.getByText("4 resultados")).toBeVisible();
    expect(screen.queryByText("Fuera de tu radar.")).not.toBeInTheDocument();
  });

  it("shows a complete summary skeleton instead of premature zero counters", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    vi.mocked(readRepository).mockImplementation(async (_client, repository) => { await pending; return demoDataset.pullRequests.filter((pr) => pr.repository.slug === repository.slug); });
    render(<App />);
    expect(await screen.findByRole("status", { name: "Cargando resumen" })).toBeVisible();
    expect(screen.queryByText("Requieren revisión")).not.toBeInTheDocument();
    expect(screen.queryByText("0 resultados")).not.toBeInTheDocument();
    finish();
    await showAllActivity();
    await screen.findByText("4 resultados");
    expect(screen.queryByRole("status", { name: "Cargando resumen" })).not.toBeInTheDocument();
  });

  it("does not expose empty ignored lists or zero counts while loading", () => {
    render(<IgnoredView preferences={defaultPreferences} pullRequests={[]} onChange={vi.fn()} onOpen={vi.fn()} loading />);
    expect(screen.getByRole("status", { name: "Cargando elementos ignorados" })).toBeVisible();
    expect(screen.queryByText("No tienes PR ignorados.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^PR ignorados/ })).not.toBeInTheDocument();
  });

  it("places the add form before a long list of repositories in keyboard order", () => {
    const repositories = Array.from({ length: 12 }, (_, index) => ({ workspace: "team", slug: `repo-${index}`, name: `Repo ${index}`, label: `Repo ${index}` }));
    render(<RepositorySettings repositories={repositories} onChange={vi.fn()} connected />);
    const add = screen.getByRole("button", { name: "Añadir repositorio" });
    const firstRemove = screen.getAllByRole("button", { name: "Dejar de seguir" })[0];
    expect(add.compareDocumentPosition(firstRemove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("links directly to Atlassian security and explains scoped token creation", async () => {
    render(<ConnectionSettings connected={false} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Crear un token" })).toHaveAttribute("href", "https://id.atlassian.com/manage-profile/security/api-tokens");
    await userEvent.click(screen.getByText("Cómo crear tu API token"));
    expect(screen.getByText("Crear token de API con alcances")).toBeVisible();
    expect(screen.getByText(/1 y 365 días/)).toBeVisible();
    expect(screen.getByText(/F5 conserva tu sesión/)).toBeVisible();
  });

  it("opens an empty notification center without an invented unread badge", async () => {
    render(<App />);
    const bell = await screen.findByLabelText("Notificaciones: 0 PR sin leer");
    await userEvent.click(bell);
    expect(screen.getByText("Estás al día. No hay novedades sin leer.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Actividad" })).not.toBeInTheDocument();
  });

  it("adds another repository, rejects duplicates and persists the configuration", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("button", { name: /^Repositorios/ }));
    await userEvent.type(screen.getByLabelText("Slug del repositorio"), "third_repo");
    await userEvent.click(screen.getByRole("button", { name: "Añadir repositorio" }));
    expect(screen.getByText("kontroller_test/third_repo")).toBeVisible();
    await waitFor(async () => expect((await loadPreferences(owner)).repositories).toHaveLength(3));
    await userEvent.type(screen.getByLabelText("Slug del repositorio"), "third_repo");
    await userEvent.click(screen.getByRole("button", { name: "Añadir repositorio" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ya está configurado");
  });

  it("supports multiple authors, exclusion and recovery of an individual PR", async () => {
    render(<App />);
    await showAllActivity();
    await screen.findByText("4 resultados");
    const selector = screen.getByRole("button", { name: "Autores: Todos los autores" });
    await userEvent.click(selector);
    await userEvent.click(screen.getByRole("switch", { name: "Ana Torres" }));
    await userEvent.click(screen.getByRole("switch", { name: "Diego Vargas" }));
    expect(screen.getByText("2 autores seleccionados")).toBeVisible();
    expect(screen.getByText("3 resultados")).toBeInTheDocument();
    await userEvent.click(selector);
    await userEvent.click(screen.getAllByRole("button", { name: "No revisar PR 184" })[0]);
    expect(screen.getByText("2 resultados")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    expect(screen.getByRole("button", { name: "Volver a revisar este PR" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Volver a revisar este PR" }));
    expect(screen.getByText("No tienes PR ignorados.")).toBeVisible();
  });

  it("scopes developer exclusions to their repository", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Configuración" }));
    await userEvent.click(screen.getByRole("button", { name: "Desarrolladores" }));
    const name = await screen.findByText("Ana Torres", { selector: "strong" });
    const row = name.closest(".directory-row");
    expect(row).not.toBeNull();
    await userEvent.click(within(row as HTMLElement).getByRole("switch", { name: "Revisar sus PR" }));
    await waitFor(async () => expect((await loadPreferences(owner)).ignoredRepositoryDeveloperKeys).toEqual(["kontroller_test/kontroller_test:dev-ana"]));
  });

  it("isolates local preferences between accounts", async () => {
    await savePreferences({ ...defaultPreferences, ignoredPullRequestKeys: ["private#1"] }, "account-a");
    expect((await loadPreferences("account-b")).ignoredPullRequestKeys).toEqual([]);
    expect((await loadPreferences("account-a")).ignoredPullRequestKeys).toEqual(["private#1"]);
  });

  it("keeps ignored developers out of the individual PR list and restores each exclusion independently", async () => {
    await savePreferences({ ...accountPreferences, ignoredDeveloperIds: ["dev-ana"], ignoredPullRequestKeys: ["providers_api#91"] }, owner);
    render(<App />);
    await showAllActivity();
    await screen.findByText("1 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    expect(screen.getByRole("button", { name: "Normalize provider timeout errors" })).toBeVisible();
    expect(screen.queryByText("Retry failed provider requests with bounded backoff")).not.toBeInTheDocument();
    expect(screen.queryByText("Add provider health signal to dashboard")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Desarrolladores/ }));
    expect(screen.getByText("Ana Torres", { selector: "strong" })).toBeVisible();
    expect(screen.getAllByRole("switch", { name: "Desarrollador ignorado" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("switch", { name: "Desarrollador ignorado" }));
    expect(screen.getByText("Nadie fuera de tu radar")).toBeVisible();
    expect((await loadPreferences(owner)).ignoredPullRequestKeys).toEqual(["providers_api#91"]);
    await userEvent.click(screen.getByRole("button", { name: /^PR ignorados/ }));
    await userEvent.click(screen.getByRole("button", { name: "Volver a revisar este PR" }));
    expect((await loadPreferences(owner)).ignoredDeveloperIds).toEqual([]);
    expect((await loadPreferences(owner)).ignoredPullRequestKeys).toEqual([]);
  });

  it("can restore stored developer and PR exclusions even when absent from current results", async () => {
    await savePreferences({ ...accountPreferences, ignoredRepositoryDeveloperKeys: ["archive/repository:{unknown-user}"], ignoredPullRequestKeys: ["archive/repository#123"] }, owner);
    render(<App />);
    await showAllActivity();
    await screen.findByText("4 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    expect(screen.getByText("PR fuera de la consulta actual")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Volver a revisar este PR" }));
    await userEvent.click(screen.getByRole("button", { name: /^Desarrolladores/ }));
    expect(screen.getByText("archive/repository")).toBeVisible();
    await userEvent.click(screen.getByRole("switch", { name: "Desarrollador ignorado" }));
    expect((await loadPreferences(owner)).ignoredRepositoryDeveloperKeys).toEqual([]);
  });

  it("does not re-follow an ignored author when an overlapping individual PR exclusion is removed", async () => {
    await savePreferences({ ...accountPreferences, ignoredDeveloperIds: ["dev-ana"], ignoredPullRequestKeys: ["kontroller_test#184"] }, owner);
    render(<App />);
    await showAllActivity();
    await screen.findByText("2 resultados");
    await userEvent.click(screen.getByRole("button", { name: "Ignorados" }));
    expect(screen.getByText("Autor también ignorado")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Volver a revisar este PR" }));
    expect((await loadPreferences(owner)).ignoredDeveloperIds).toEqual(["dev-ana"]);
    await userEvent.click(screen.getByRole("button", { name: "Resumen" }));
    expect(screen.queryByText("Retry failed provider requests with bounded backoff")).not.toBeInTheDocument();
  });
});
