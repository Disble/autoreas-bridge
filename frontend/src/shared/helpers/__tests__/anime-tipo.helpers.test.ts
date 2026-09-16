import { describe, expect, it } from "vitest";
import { getAnimeTipoLabel } from "../anime-tipo.helpers";

describe("getAnimeTipoLabel", () => {
  it.each([
    [0, "Anime (TV)"],
    [1, "Película"],
    [2, "Especial"],
    [3, "OVA"],
  ])("maps tipo %i to the Legacy-truth label %s", (tipo, label) => {
    expect(getAnimeTipoLabel(tipo)).toBe(label);
  });

  it("degrades an absent tipo to Unknown", () => {
    expect(getAnimeTipoLabel(undefined)).toBe("Unknown");
  });

  it("falls back to the raw tipo as string for unknown values", () => {
    expect(getAnimeTipoLabel(9)).toBe("9");
  });
});
