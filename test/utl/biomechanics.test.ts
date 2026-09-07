import { describe, expect, it } from "vitest";
import { getBiomechanicalContext } from "@/utl/biomechanics";

describe("getBiomechanicalContext", () => {
  it("devuelve cadena vacía sin deporte ni disciplina", () => {
    expect(getBiomechanicalContext()).toBe("");
    expect(getBiomechanicalContext(undefined, undefined)).toBe("");
  });

  it("devuelve cadena vacía para un deporte sin reglas específicas", () => {
    expect(getBiomechanicalContext("Ajedrez", "Blitz")).toBe("");
  });

  it("incluye las reglas de jabalina y el contexto del atleta", () => {
    const ctx = getBiomechanicalContext("Atletismo", "Lanz. Jabalina");
    expect(ctx).toContain("[ROLE: EXPERT WORLD ATHLETICS BIOMECHANIST]");
    expect(ctx).toContain("[CONTEXT: Analyzing Atletismo - Lanz. Jabalina]");
    expect(ctx).toContain("[RULE]: BLOCKING LEG");
  });

  it("no distingue mayúsculas al emparejar la disciplina", () => {
    expect(getBiomechanicalContext("atletismo", "lanz. jabalina")).toContain("[RULE]:");
  });

  it("exige responder en el idioma del usuario", () => {
    expect(getBiomechanicalContext("Atletismo", "Lanz. Jabalina")).toMatch(/SAME LANGUAGE/);
  });
});
