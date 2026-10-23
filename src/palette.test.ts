import { describe, expect, it } from "vitest";
import stylesheet from "./index.css?raw";
import design from "../DESIGN.md?raw";
import html from "../index.html?raw";
import favicon from "../public/favicon.svg?raw";

const root = stylesheet.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "";
const colors = new Map([...root.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]));
const surfaces = ["background", "surface", "surface-raised", "surface-inset", "surface-hover", "surface-tint"];

function rgb(token: string): number[] {
  const hex = colors.get(token);
  if (!hex) throw new Error(`Missing palette token: ${token}`);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(channels: number[]): number {
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first: number[], second: number[]): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("expressive dark palette", () => {
  it.each(["ink", "muted", "subtle", "signal", "blue", "coral", "violet", "mint", "warning"])("keeps %s text readable across all neutral surfaces", (token) => {
    for (const surface of surfaces) expect(contrast(rgb(token), rgb(surface)), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["signal", "blue", "coral", "mint", "warning", "muted"])("keeps %s status labels readable on their tinted badges", (token) => {
    const foreground = rgb(token);
    const background = rgb("surface").map((channel, index) => channel * 0.86 + foreground[index] * 0.14);
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves primary-button and focus contrast", () => {
    expect(contrast(rgb("on-primary"), rgb("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb("on-primary"), rgb("primary-hover"))).toBeGreaterThanOrEqual(4.5);
    for (const surface of surfaces) expect(contrast(rgb("signal"), rgb(surface))).toBeGreaterThanOrEqual(3);
  });

  it("retains distinct, saturated accents instead of flattening every section to gray", () => {
    for (const token of ["primary", "signal", "blue", "coral", "mint", "warning"]) {
      const channels = rgb(token);
      const saturation = (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels);
      expect(saturation, token).toBeGreaterThanOrEqual(0.3);
    }
    expect(new Set(["signal", "blue", "coral", "warning"].map((token) => colors.get(token))).size).toBe(4);
    const navigationRules = stylesheet.split("\n").filter((line) => /^\s*\.(settings-tabs button|ignored-tabs > button)/.test(line));
    expect(navigationRules.join("\n")).not.toContain("--tone: var(--signal)");
  });

  it("keeps summary text readable on its colored hover surfaces", () => {
    for (const tone of ["signal", "blue", "coral", "warning", "muted"]) {
      const background = rgb("surface").map((channel, index) => channel * 0.84 + rgb(tone)[index] * 0.16);
      for (const text of [tone, "muted", "subtle"]) expect(contrast(rgb(text), background), `${text} on ${tone} card`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps documented colors and browser assets aligned with the runtime tokens", () => {
    for (const [name, color] of colors) {
      const documentedName = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      expect(design.toLowerCase()).toContain(`${documentedName}: "${color}"`.toLowerCase());
    }
    expect(html).toContain(`name="theme-color" content="${colors.get("background")}"`);
    expect(favicon).toContain(`fill="${colors.get("primary")}"`);
    expect(favicon).toContain(`fill="${colors.get("on-primary")}"`);
  });

  it("does not reintroduce neon colors or decorative gradients", () => {
    expect(`${stylesheet}${favicon}`).not.toMatch(/#(?:e7f[89]65|8ad8ff|c4b0ff|ff8d75|f2ff94)/i);
    const gradients = stylesheet.split("\n").filter((line) => /(?:linear|radial)-gradient/.test(line));
    expect(gradients).toHaveLength(1);
    expect(gradients[0]).toMatch(/^\.skeleton-block::after /);
  });
});
