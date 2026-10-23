import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SyncStatus } from "./SyncStatus";

afterEach(cleanup);
const next = "2026-10-23T01:30:00.000Z";

it("shows the actual scheduled instant in local clock format for live and cached data", () => {
  const view = render(<SyncStatus state={{ status: "success", lastSyncedAt: "2026-10-23T01:20:00Z", nextSyncAt: next }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Próxima consulta");
  expect(view.container.querySelector("time")).toHaveAttribute("datetime", next);
  expect(view.container.querySelector("time")).toHaveTextContent(new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(next)));
  view.rerender(<SyncStatus state={{ status: "success", source: "cache", nextSyncAt: next }} />);
  expect(view.container.querySelector("time")).toHaveAttribute("datetime", next);
  expect(screen.getByRole("status")).toHaveTextContent("app visible");
});
it("labels the retry accurately after a failure while keeping the error visible", () => {
  render(<SyncStatus state={{ status: "error", nextSyncAt: next, message: "Sin acceso al repositorio" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Actualización incompleta · Sin acceso al repositorio");
  expect(screen.getByRole("status")).toHaveTextContent("Próximo intento");
});
it("does not promise another deadline while syncing or without a valid deadline", () => {
  const view = render(<SyncStatus state={{ status: "syncing", nextSyncAt: next }} />);
  expect(view.container.querySelector("time")).not.toBeInTheDocument();
  view.rerender(<SyncStatus state={{ status: "success", nextSyncAt: "invalid" }} />);
  expect(view.container.querySelector("time")).not.toBeInTheDocument();
});
it("explains paused synchronization when there are no repositories", () => {
  const view = render(<SyncStatus enabled={false} state={{ status: "success", nextSyncAt: next }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Sin repositorios. Añade uno en Configuración");
  expect(view.container.querySelector("time")).not.toBeInTheDocument();
});
