import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function SearchHarness({ onActivate = vi.fn(), disabled = false }: { onActivate?: () => void; disabled?: boolean }) {
  const [query, setQuery] = useState("provider");
  return <Topbar query={query} onQueryChange={setQuery} onSearchActivate={onActivate} syncState={{ status: "idle" }} onSync={vi.fn()} notifications={[]} onOpenNotification={vi.fn()} onReadAll={vi.fn()} searchDisabled={disabled} />;
}

describe("header search shortcuts", () => {
  it("shows the Windows shortcut without changing the input's accessible name", () => {
    render(<SearchHarness />);
    expect(screen.getByLabelText("Buscar por título o PR")).toHaveAttribute("aria-keyshortcuts", "Control+k Control+Alt+k");
    expect(screen.getByText("Ctrl + K", { selector: "kbd" })).toBeVisible();
    expect(screen.queryByText(/⌘/)).not.toBeInTheDocument();
  });

  it.each([false, true])("focuses and selects the query, cancelling browser search (Alt=%s)", (altKey) => {
    const onActivate = vi.fn();
    render(<SearchHarness onActivate={onActivate} />);
    const handled = fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey, cancelable: true });
    const input = screen.getByLabelText<HTMLInputElement>("Buscar por título o PR");
    expect(handled).toBe(false);
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it.each([
    { key: "k" },
    { key: "/" },
    { key: "k", metaKey: true },
    { key: "k", ctrlKey: true, shiftKey: true },
    { key: "k", ctrlKey: true, metaKey: true },
    { key: "k", ctrlKey: true, isComposing: true },
  ])("preserves typing, IME and unrelated browser shortcuts: %j", (keys) => {
    render(<SearchHarness />);
    expect(fireEvent.keyDown(window, { ...keys, cancelable: true })).toBe(true);
    expect(screen.getByLabelText("Buscar por título o PR")).not.toHaveFocus();
  });

  it("does not move focus out of an open dialog", () => {
    render(<><SearchHarness /><dialog open><button type="button" onClick={(event) => event.currentTarget.closest("dialog")?.removeAttribute("open")}>Cerrar diálogo</button></dialog></>);
    const action = screen.getByRole("button", { name: "Cerrar diálogo" });
    action.focus();
    expect(fireEvent.keyDown(action, { key: "k", ctrlKey: true, cancelable: true })).toBe(true);
    expect(action).toHaveFocus();
  });

  it("does not treat an AltGr character as the fallback shortcut", () => {
    render(<SearchHarness />);
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, altKey: true, cancelable: true });
    vi.spyOn(event, "getModifierState").mockImplementation((modifier) => modifier === "AltGraph");
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Buscar por título o PR")).not.toHaveFocus();
  });

  it("supports Firefox on Windows reporting Ctrl+left Alt as AltGraph", () => {
    render(<SearchHarness />);
    fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true, ctrlKey: true });
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, altKey: true, cancelable: true });
    vi.spyOn(event, "getModifierState").mockImplementation((modifier) => modifier === "AltGraph");
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Buscar por título o PR")).toHaveFocus();
  });

  it.each(["keyup", "blur"])("resets the physical Alt state on %s", (reset) => {
    render(<SearchHarness />);
    fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true });
    if (reset === "keyup") fireEvent.keyUp(window, { key: "Alt", code: "AltLeft" });
    else fireEvent.blur(window);
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, altKey: true, cancelable: true });
    vi.spyOn(event, "getModifierState").mockImplementation((modifier) => modifier === "AltGraph");
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Buscar por título o PR")).not.toHaveFocus();
  });

  it("leaves Ctrl+K available to a rich-text editor", () => {
    render(<><SearchHarness /><div contentEditable role="textbox" aria-label="Editor de comentarios" /></>);
    const editor = screen.getByRole("textbox", { name: "Editor de comentarios" });
    editor.focus();
    expect(fireEvent.keyDown(editor, { key: "k", ctrlKey: true, cancelable: true })).toBe(true);
    expect(editor).toHaveFocus();
  });

  it("respects previously handled events and disabled search", () => {
    const view = render(<SearchHarness />);
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true });
    event.preventDefault();
    act(() => { window.dispatchEvent(event); });
    expect(screen.getByLabelText("Buscar por título o PR")).not.toHaveFocus();
    view.rerender(<SearchHarness disabled />);
    expect(fireEvent.keyDown(window, { key: "k", ctrlKey: true, cancelable: true })).toBe(true);
    expect(screen.getByLabelText("Buscar por título o PR")).not.toHaveFocus();
  });

  it("cancels repeated shortcut events without repeatedly selecting newly typed text", () => {
    render(<SearchHarness />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByLabelText<HTMLInputElement>("Buscar por título o PR");
    input.setSelectionRange(2, 2);
    expect(fireEvent.keyDown(window, { key: "k", ctrlKey: true, repeat: true, cancelable: true })).toBe(false);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
  });

  it("clears the query and restores search focus", async () => {
    render(<SearchHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    const input = screen.getByLabelText("Buscar por título o PR");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("removes the global listener when unmounted", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const view = render(<SearchHarness />);
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
