import "@testing-library/jest-dom";
import type {} from "vitest/jsdom";

// Node 26's optional Web Storage can shadow jsdom's browser storage in Vitest 3.
if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { configurable: true, value: jsdom.window.localStorage });
