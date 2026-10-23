import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface Props {
  label: string;
  summary: string;
  children: ReactNode;
  searchable?: boolean;
  matchTriggerWidth?: boolean;
  leading?: ReactNode;
}

export function FilterPopover({ label, summary, children, searchable, matchTriggerWidth, leading }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const open = phase === "open";
  const visible = phase !== "closed";
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });

  const close = useCallback((restoreFocus = false) => {
    setPhase((current) => current === "open" ? "closing" : current);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upward = below < 200 && above > below;
      const maxHeight = Math.max(80, Math.min(360, upward ? above : below));
      const width = Math.min(searchable && !matchTriggerWidth ? Math.max(rect.width, 300) : rect.width, window.innerWidth - 24);
      setPosition({ top: upward ? Math.max(8, rect.top - Math.min(panel.current?.scrollHeight ?? maxHeight, maxHeight) - 6) : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place);
    if (trigger.current) observer?.observe(trigger.current);
    if (panel.current) observer?.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { observer?.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [visible, searchable, matchTriggerWidth]);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(() => setPhase("closed"), 160);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(true); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    const initial = !searchable ? panel.current?.querySelector<HTMLInputElement>("input:checked") : undefined;
    (initial ?? panel.current?.querySelector<HTMLInputElement>("input"))?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); };
  }, [open, searchable, close]);

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (searchable && event.key === "ArrowDown" && event.target instanceof HTMLInputElement && event.target.type !== "radio") {
      const option = event.currentTarget.querySelector<HTMLInputElement>("input[type='radio']:checked") ?? event.currentTarget.querySelector<HTMLInputElement>("input[type='radio']");
      if (option) { event.preventDefault(); option.focus(); }
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "radio") { event.preventDefault(); close(true); }
    if (event.key !== "Tab") return;
    const controlsInPanel = [...event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])")];
    const radioStops = new Map<string, HTMLInputElement>();
    for (const item of controlsInPanel) {
      if (item instanceof HTMLInputElement && item.type === "radio" && (!radioStops.has(item.name) || item.checked)) radioStops.set(item.name, item);
    }
    const items = controlsInPanel.filter((item) => !(item instanceof HTMLInputElement) || item.type !== "radio" || radioStops.get(item.name) === item);
    if (event.shiftKey && event.target === items[0]) { event.preventDefault(); close(true); }
    if (!event.shiftKey && event.target === items.at(-1)) {
      event.preventDefault();
      const controls = [...document.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select, summary, [tabindex='0']")].filter((item) => !panel.current?.contains(item) && item.getClientRects().length > 0 && !item.closest("[inert]"));
      const index = trigger.current ? controls.indexOf(trigger.current) : -1;
      close();
      (controls[index + 1] ?? trigger.current)?.focus();
    }
  };

  return <div className="filter-popover">
    <button className="filter-select-trigger" type="button" ref={trigger} aria-label={`${label}: ${summary}`} aria-expanded={open} aria-controls={visible ? id : undefined} onClick={() => open ? close() : setPhase("open")} onKeyDown={(event) => { if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) { event.preventDefault(); if (!open) setPhase("open"); else (panel.current?.querySelector<HTMLElement>("input:checked") ?? panel.current?.querySelector<HTMLElement>("input, button"))?.focus(); } }} >{leading}<span>{summary}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {visible && createPortal(<div className={`filter-popover-panel ${phase === "closing" ? "is-closing" : ""}`} style={position} ref={panel} id={id} role="group" aria-label={label} inert={!open} onClick={(event) => { if (event.detail > 0 && event.target instanceof HTMLInputElement && event.target.type === "radio") close(true); }} onKeyDown={handlePanelKeyDown}>{children}</div>, document.body)}
  </div>;
}
