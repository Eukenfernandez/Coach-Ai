import { describe, expect, it } from "vitest";
import { formatDuration, formatDurationLabel } from "@/utl/videoUtils";

describe("formatDuration", () => {
  it("formatea segundos como m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("descarta la parte decimal", () => {
    expect(formatDuration(59.9)).toBe("0:59");
  });
});

describe("formatDurationLabel", () => {
  it("formatea con dos dígitos en minutos y segundos", () => {
    expect(formatDurationLabel(0)).toBe("00:00");
    expect(formatDurationLabel(7)).toBe("00:07");
    expect(formatDurationLabel(125)).toBe("02:05");
  });

  it("nunca devuelve valores negativos", () => {
    expect(formatDurationLabel(-30)).toBe("00:00");
  });
});
