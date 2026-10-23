import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { effectiveQaIds, resolvedQaTeam } from "../../config/qa-users";
import { defaultPreferences } from "../../lib/storage/indexed-db";
import { normalizePullRequestSummary } from "../../lib/bitbucket/normalizers";
import type { LocalPreferences } from "../../types/domain";
import type { SharedQaTeam } from "../../lib/team/contracts";
import { QaTeamSettings } from "./components/QaTeamSettings";
import { DeveloperSettings } from "./components/DeveloperSettings";

const people = [
  { accountId: "{jm}", atlassianAccountId: "account-jm", displayName: "Javier Mejías", nickname: "jmejias" },
  { accountId: "{dc}", displayName: "Diego Gustavo Cuevas Montes" },
  { accountId: "{ir}", displayName: "Iván Reyes" },
  { accountId: "{other}", displayName: "Otra persona QA" },
];
afterEach(cleanup);

it("renders the same roster read-only without exposing edit actions or IDs", () => {
  const save = vi.fn();
  render(<QaTeamSettings people={people} qaTeamState={{ status: "ready", snapshot: { members: people, canEdit: false, revision: "one", updatedAt: null } }} onSaveQaTeam={save} />);
  expect(screen.getByRole("list", { name: "QA configurados" }).children).toHaveLength(4);
  expect(screen.getByText(/Solo Javier Mejías puede modificar/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Añadir QA|Quitar a/ })).not.toBeInTheDocument();
  for (const person of people) expect(screen.getByRole("list")).not.toHaveTextContent(person.accountId);
  expect(save).not.toHaveBeenCalled();
});

it("does not claim failed removals succeeded and disables edits until explicit recovery", async () => {
  const save = vi.fn().mockResolvedValue(false);
  const snapshot = { members: people, canEdit: true, revision: "one", updatedAt: null };
  const view = render(<QaTeamSettings people={people} qaTeamState={{ status: "ready", snapshot }} onSaveQaTeam={save} />);
  await userEvent.click(screen.getByRole("button", { name: "Quitar a Iván Reyes del equipo QA" }));
  expect(screen.getByRole("list").children).toHaveLength(4);
  expect(screen.queryByRole("button", { name: "Deshacer" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Guardado para todos/)).not.toBeInTheDocument();
  view.rerender(<QaTeamSettings people={people} qaTeamState={{ status: "error", snapshot, message: "Conflicto de versión" }} onSaveQaTeam={save} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Actualízala antes de editar");
  expect(screen.getByRole("button", { name: "Quitar a Iván Reyes del equipo QA" })).toBeDisabled();
});

it("never guesses QA from names or perspective and preserves existing explicit choices", () => {
  expect(effectiveQaIds({ ...defaultPreferences, role: "qa" })).toEqual([]);
  expect(resolvedQaTeam(defaultPreferences)).toEqual([]);
  const old = { ...defaultPreferences, qaTeamBindings: { javier: people[0], diego: people[1] }, qaAccountIds: ["legacy"] };
  expect(effectiveQaIds(old)).toEqual(["account-jm", "legacy", "{dc}", "{jm}"]);
  expect(effectiveQaIds({ ...old, qaTeamMembers: [] })).toEqual([]);
});

it("recovers valid legacy bindings independently from malformed neighbors", () => {
  const malformed = { ...defaultPreferences, qaAccountIds: ["legacy"], qaTeamBindings: { javier: people[0], diego: { accountId: 42 } } };
  expect(effectiveQaIds(malformed as unknown as LocalPreferences)).toEqual(["account-jm", "legacy", "{jm}"]);
});

it("confirms shared QA edits without IDs or a technical export, with removal and undo", async () => {
  function Harness() { const [snapshot, setSnapshot] = useState<SharedQaTeam>({ members: [], revision: "initial", updatedAt: null, canEdit: true }); return <QaTeamSettings people={people} qaTeamState={{ status: "ready", snapshot }} onSaveQaTeam={async (members) => { setSnapshot((current) => ({ ...current, members })); return true; }} />; }
  render(<Harness />);
  expect(screen.getByText("0 QA")).toBeVisible();
  const choose = async (person: typeof people[number]) => {
    await userEvent.click(screen.getByRole("button", { name: /^Añadir persona al equipo QA:/ }));
    const group = screen.getByRole("group", { name: "Añadir persona al equipo QA" });
    expect(group).not.toHaveTextContent(/ID:/);
    for (const profile of people) expect(group).not.toHaveTextContent(profile.accountId);
    await userEvent.click(screen.getAllByRole("radio").find((radio) => (radio as HTMLInputElement).value === person.accountId)!);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Añadir persona al equipo QA" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Añadir QA" }));
  };
  for (const person of people) await choose(person);
  expect(screen.getByText("4 QA")).toBeVisible();
  expect(screen.getByRole("list", { name: "QA configurados" }).children).toHaveLength(4);
  for (const person of people) expect(screen.getByRole("list", { name: "QA configurados" })).not.toHaveTextContent(person.accountId);
  await userEvent.click(screen.getByRole("button", { name: "Quitar a Iván Reyes del equipo QA" }));
  await userEvent.click(screen.getByRole("button", { name: "Quitar a Diego Gustavo Cuevas Montes del equipo QA" }));
  expect(screen.getByText("2 QA")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
  expect(screen.getByText("3 QA")).toBeVisible();
  expect(screen.queryByText("Configuración para publicar")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("loads members with no PR, retains ignored people as candidates, and labels workspace access honestly", async () => {
  const repository = defaultPreferences.repositories[0];
  const load = vi.fn().mockResolvedValue([{ repository, source: "workspace", people, message: "Acceso al repositorio sin verificar." }]);
  render(<DeveloperSettings preferences={{ ...defaultPreferences, ignoredDeveloperIds: [people[1].accountId] }} user={people[0]} pullRequests={[]} onChange={vi.fn()} onLoadDirectory={load} qaTeamState={{ status: "ready", snapshot: { members: [], canEdit: true, revision: "initial", updatedAt: null } }} onSaveQaTeam={vi.fn()} />);
  await screen.findByText("4 cuentas del directorio");
  expect(screen.getByText("Miembros del workspace")).toBeVisible();
  expect(screen.queryByRole("switch", { name: "Revisar sus PR" })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Buscar persona"), "nadie");
  await userEvent.click(screen.getByRole("button", { name: /^Añadir persona al equipo QA:/ }));
  const group = screen.getByRole("group", { name: "Añadir persona al equipo QA" });
  expect(within(group).getByRole("radio", { name: /Diego Gustavo Cuevas Montes/ })).toBeVisible();
  expect(group).not.toHaveTextContent(people[1].accountId);
});

it("offers retry and explicit permission guidance while still allowing local QA configuration", async () => {
  const repository = defaultPreferences.repositories[0];
  const load = vi.fn().mockResolvedValue([{ repository, source: "unavailable", people: [], message: "Falta read:workspace:bitbucket." }]);
  render(<DeveloperSettings preferences={defaultPreferences} user={people[0]} pullRequests={[]} onChange={vi.fn()} onLoadDirectory={load} />);
  await screen.findByText("Falta read:workspace:bitbucket.");
  expect(screen.getByText("Lista parcial de PR")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Actualizar personas" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

it("identifies each repository explicitly without exposing IDs in the following directory", async () => {
  const repositories = [
    { workspace: "shared-team", slug: "app", name: "app", label: "Aplicación" },
    { workspace: "shared-team", slug: "api", name: "api", label: "API del equipo" },
  ];
  const load = vi.fn().mockResolvedValue(repositories.map((repository) => ({ repository, source: "workspace", people: [people[1]] })));
  render(<DeveloperSettings preferences={{ ...defaultPreferences, repositories }} pullRequests={[]} onChange={vi.fn()} onLoadDirectory={load} />);
  const list = await screen.findByRole("list", { name: "Desarrolladores por repositorio" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  for (const [index, row] of rows.entries()) {
    expect(within(row).getByText(people[1].displayName)).toBeVisible();
    expect(within(row).getByText("Repositorio")).toBeVisible();
    expect(within(row).getByText(repositories[index].label)).toBeVisible();
    expect(within(row).getByText(`shared-team/${repositories[index].slug}`)).toBeVisible();
    expect(within(row).getByText("Acceso sin verificar")).toBeVisible();
    expect(within(row).getByText(/El seguimiento estará disponible/)).toBeVisible();
    expect(row).not.toHaveTextContent(people[1].accountId);
  }
  expect(screen.getByText("1 persona")).toBeVisible();
  await userEvent.selectOptions(screen.getByLabelText("Repositorio del equipo"), "shared-team/api");
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(within(list).queryByText("shared-team/app")).not.toBeInTheDocument();
});

it("offers following without any PR when repository membership is verified", async () => {
  const repository = defaultPreferences.repositories[0];
  const load = vi.fn().mockResolvedValue([{ repository, source: "repository", people: [people[1]] }]);
  const change = vi.fn();
  render(<DeveloperSettings preferences={defaultPreferences} pullRequests={[]} onChange={change} onLoadDirectory={load} />);
  const toggle = await screen.findByRole("switch", { name: "Revisar sus PR" });
  expect(toggle).toBeChecked();
  toggle.focus();
  await userEvent.keyboard(" ");
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ ignoredRepositoryDeveloperKeys: [`${repository.workspace}/${repository.slug}:${people[1].accountId}`] }));
});

it.each(["origin", "fork"])("offers following for a PR author working from %s despite workspace fallback", async (source) => {
  const repository = defaultPreferences.repositories[0];
  const pullRequest = normalizePullRequestSummary({
    id: 42, title: "Update from a branch", state: "OPEN", author: { uuid: people[1].accountId, display_name: people[1].displayName },
    created_on: "2026-10-22T10:00:00Z", updated_on: "2026-10-22T11:00:00Z",
    source: { repository: { full_name: source === "fork" ? "developer/fork" : `${repository.workspace}/${repository.slug}` }, branch: { name: "feature" } },
    destination: { repository: { full_name: `${repository.workspace}/${repository.slug}` }, branch: { name: "main" } },
  }, repository);
  const load = vi.fn().mockResolvedValue([{ repository, source: "workspace", people: [people[1]] }]);
  render(<DeveloperSettings preferences={defaultPreferences} pullRequests={[pullRequest]} onChange={vi.fn()} onLoadDirectory={load} />);
  await screen.findByText("1 cuentas del directorio");
  const list = screen.getByRole("list", { name: "Desarrolladores por repositorio" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(within(list).getByRole("switch", { name: "Revisar sus PR" })).toBeChecked();
  expect(within(list).queryByText("Acceso sin verificar")).not.toBeInTheDocument();
});
