import { describe, expect, it } from "vitest";
import { initials } from "./formatting";

describe("avatar initials", () => {
  it("abbreviates the team's display names", () => {
    expect(initials("Javier Mejías")).toBe("JM");
    expect(initials("Diego Gustavo Cuevas Montes")).toBe("DC");
    expect(initials("  Ana   Torres ")).toBe("AT");
    expect(initials("Iván")).toBe("I");
  });
});
