import { useEffect, useRef } from "react";

export function useSearchShortcut() {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let leftAltPressed = false;
    const focusSearch = (event: KeyboardEvent) => {
      if (event.code === "AltLeft") leftAltPressed = true;
      // Firefox on Windows also reports Ctrl+Alt as AltGraph; preserve physical AltGr typing.
      if (event.defaultPrevented || event.isComposing || (event.getModifierState("AltGraph") && !leftAltPressed)) return;
      if (!event.ctrlKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (!input.current || input.current.disabled || document.querySelector("dialog[open], [role=dialog][aria-modal=true]")) return;
      if (event.target instanceof Element && event.target.closest('[contenteditable]:not([contenteditable="false"])')) return;

      event.preventDefault();
      if (event.repeat) return;
      input.current.focus();
      input.current.select();
    };
    const releaseAlt = (event: KeyboardEvent) => { if (event.code === "AltLeft") leftAltPressed = false; };
    const resetModifiers = () => { leftAltPressed = false; };

    window.addEventListener("keydown", focusSearch);
    window.addEventListener("keyup", releaseAlt);
    window.addEventListener("blur", resetModifiers);
    return () => { window.removeEventListener("keydown", focusSearch); window.removeEventListener("keyup", releaseAlt); window.removeEventListener("blur", resetModifiers); };
  }, []);

  return input;
}
