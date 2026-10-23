import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrList } from "./PrList";

afterEach(cleanup);

it("distinguishes pending data from an empty result", () => {
  const onOpen = vi.fn();
  const { rerender } = render(<PrList loading pullRequests={[]} onOpen={onOpen} showIgnore={false} />);
  expect(screen.getByRole("status", { name: "Cargando pull requests" })).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("No hay PR que mostrar")).not.toBeInTheDocument();
  rerender(<PrList loading={false} pullRequests={[]} onOpen={onOpen} showIgnore={false} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("No hay PR que mostrar")).toBeVisible();
});
