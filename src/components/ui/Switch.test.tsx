import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

afterEach(cleanup);

it("exposes its state and toggles by keyboard", async () => {
  function ControlledSwitch() {
    const [checked, setChecked] = useState(false);
    return <Switch label="Revisar sus PR" checked={checked} onCheckedChange={setChecked} description="Solo en este repositorio" />;
  }
  render(<ControlledSwitch />);
  const control = screen.getByRole("switch", { name: "Revisar sus PR" });
  expect(control).not.toBeChecked();
  expect(control).toHaveAccessibleDescription("Solo en este repositorio");
  await userEvent.tab();
  await userEvent.keyboard(" ");
  expect(control).toBeChecked();
  await userEvent.keyboard("{Enter}");
  expect(control).not.toBeChecked();
});

it("prevents duplicate changes while busy", async () => {
  const onChange = vi.fn();
  render(<Switch label="Sonido" checked busy onCheckedChange={onChange} />);
  await userEvent.click(screen.getByRole("switch", { name: "Sonido" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("switch")).toBeDisabled();
});
