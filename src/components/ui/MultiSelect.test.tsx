import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MultiSelect } from "./MultiSelect";
import { FilterSelect } from "./FilterSelect";

afterEach(cleanup);
const people = [{ accountId: "jm", displayName: "Javier Mejías" }, { accountId: "dc", displayName: "Diego Cuevas", nickname: "dieguito" }];

function Example() {
  const [selected, setSelected] = useState<string[]>([]);
  return <><MultiSelect people={[...people, people[0]]} selected={selected} onChange={setSelected} /><input aria-label="Fuera" /></>;
}

describe("author filter disclosure", () => {
  it("searches accent-insensitively, keeps selections across searches and deduplicates authors", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Autores: Todos los autores" }));
    expect(screen.getByLabelText("Buscar autores")).toHaveFocus();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    await userEvent.type(screen.getByLabelText("Buscar autores"), "mejias");
    expect(screen.queryByRole("switch", { name: "Diego Cuevas" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Javier Mejías" }));
    await userEvent.click(screen.getByRole("button", { name: "Limpiar buscar autores" }));
    await userEvent.type(screen.getByLabelText("Buscar autores"), "dieguito");
    await userEvent.click(screen.getByRole("switch", { name: "Diego Cuevas" }));
    expect(screen.getByRole("button", { name: "Autores: 2 autores seleccionados" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: /Todos los autores/ }));
    expect(screen.getByRole("switch", { name: "Diego Cuevas" })).toHaveAttribute("aria-checked", "false");
  });

  it("closes on outside pointer and Escape, restores focus only on keyboard dismissal", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Autores: Todos los autores" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("textbox", { name: "Fuera" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox", { name: "Fuera" })).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("group", { name: "Autores" })).not.toBeInTheDocument());
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows an honest empty search and clears it immediately", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Autores: Todos los autores" }));
    await userEvent.type(screen.getByLabelText("Buscar autores"), "unknown");
    expect(screen.getByRole("status")).toHaveTextContent("No hay autores que coincidan");
    await userEvent.click(screen.getByRole("button", { name: "Limpiar buscar autores" }));
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByLabelText("Buscar autores")).toHaveFocus();
  });
});

describe("single-value filter disclosure", () => {
  function Single() {
    const [value, setValue] = useState("attention");
    return <FilterSelect label="Actividad" value={value} onChange={setValue} options={[{ value: "all", label: "Cualquier actividad" }, { value: "attention", label: "Requiere atención" }]} />;
  }
  it("uses native radios, selects a value and closes with focus restored", async () => {
    render(<Single />);
    await userEvent.click(screen.getByRole("button", { name: "Actividad: Requiere atención" }));
    expect(screen.getByRole("radio", { name: "Requiere atención" })).toHaveFocus();
    await userEvent.click(screen.getByRole("radio", { name: "Cualquier actividad" }));
    const trigger = screen.getByRole("button", { name: "Actividad: Cualquier actividad" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
