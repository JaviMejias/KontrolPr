import { expect, it } from "vitest";
import stylesheet from "./index.css?raw";
import design from "../DESIGN.md?raw";

it("keeps the authenticated header and content fluid with the same horizontal gutter", () => {
  for (const selector of ["topbar", "content-wrap"]) {
    const rule = stylesheet.match(new RegExp(`^\\.${selector}\\s*\\{([^}]+)\\}`, "m"))?.[1];
    expect(rule).toContain("max-width: none;");
    expect(rule).toContain("var(--page-gutter)");
    expect(rule).not.toContain("margin: 0 auto;");
  }
});

it("documents the desktop and mobile gutter tokens without retaining a page width cap", () => {
  expect(stylesheet.match(/--page-gutter:\s*(20px);/)?.[1]).toBe("20px");
  expect(stylesheet.match(/--page-gutter:\s*(16px);/)?.[1]).toBe("16px");
  expect(design.match(/page-gutter:\s*"([^"]+)"/)?.[1]).toBe("20px");
  expect(design.match(/page-gutter-mobile:\s*"([^"]+)"/)?.[1]).toBe("16px");
  expect(design.includes("page-max:")).toBe(false);
});
