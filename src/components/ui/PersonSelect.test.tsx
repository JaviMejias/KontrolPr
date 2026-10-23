import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PersonSelect } from "./PersonSelect";

afterEach(cleanup);
const people = [
  { accountId: "{jm}", displayName: "Javier Mejías", nickname: "jmejias" },
  { accountId: "{dc}", displayName: "Diego Cuevas", nickname: "dieguito" },
];

function Example() {
  const [value, setValue] = useState("");
  return <><PersonSelect label="QA" people={[...people, people[0]]} value={value} onChange={setValue} /><input aria-label="Fuera" /></>;
}

it("searches names without accents and aliases, clears, selects and restores focus", async () => {
  render(<Example />);
  await userEvent.click(screen.getByRole("button", { name: "QA: Selecciona una cuenta" }));
  const search = screen.getByLabelText("Buscar cuenta para QA");
  expect(search).toHaveFocus();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  await userEvent.type(search, "mejias");
  expect(screen.queryByRole("radio", { name: /Diego/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Limpiar buscar cuenta para qa" }));
  expect(search).toHaveFocus();
  await userEvent.type(search, "dieguito");
  await userEvent.click(screen.getByRole("radio", { name: /Diego Cuevas/ }));
  const trigger = screen.getByRole("button", { name: "QA: Diego Cuevas" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
  await waitFor(() => expect(screen.queryByRole("group", { name: "QA" })).not.toBeInTheDocument());
});

it("supports search-to-radio keyboard navigation, IME, Enter, Escape and outside dismissal", async () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "QA: Selecciona una cuenta" });
  await userEvent.click(trigger);
  const search = screen.getByLabelText("Buscar cuenta para QA");
  fireEvent.keyDown(search, { key: "ArrowDown", isComposing: true });
  expect(search).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("radio", { name: "Sin vincular" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByRole("button", { name: "QA: Javier Mejías" })).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("textbox", { name: "Fuera" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("textbox", { name: "Fuera" })).toHaveFocus();
});

it("keeps duplicate names without exposing IDs and explains empty and loading results", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<PersonSelect label="QA" people={[]} value="" onChange={onChange} loading />);
  await userEvent.click(screen.getByRole("button", { name: "QA: Selecciona una cuenta" }));
  expect(screen.getByText("Buscando personas en los PR…")).toBeVisible();
  rerender(<PersonSelect label="QA" people={[]} value="" onChange={onChange} />);
  expect(screen.getByText("No hay cuentas cargadas. Sincroniza tus repositorios.")).toBeVisible();
  rerender(<PersonSelect label="QA" people={[people[0], { ...people[0], accountId: "{other}" }]} value="" onChange={onChange} />);
  expect(screen.getAllByRole("radio", { name: /Javier Mejías/ })).toHaveLength(2);
  expect(screen.getByRole("group", { name: "QA" })).not.toHaveTextContent("{other}");
  await userEvent.type(screen.getByLabelText("Buscar cuenta para QA"), "nadie");
  expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

it("selects the correct stable account when names and aliases are identical without rendering IDs", async () => {
  const onChange = vi.fn();
  render(<PersonSelect label="QA" people={[people[0], { ...people[0], accountId: "{other}" }]} value="" onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "QA: Selecciona una cuenta" }));
  const group = screen.getByRole("group", { name: "QA" });
  expect(group).not.toHaveTextContent(/ID:|\{jm\}|\{other\}/);
  const options = screen.getAllByRole("radio", { name: /Javier Mejías/ });
  expect(options.map((option) => (option as HTMLInputElement).value)).toEqual(["{jm}", "{other}"]);
  await userEvent.click(options[1]);
  expect(onChange).toHaveBeenCalledWith("{other}");
});
