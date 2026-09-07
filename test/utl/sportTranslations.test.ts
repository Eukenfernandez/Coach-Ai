import { describe, expect, it } from "vitest";
import {
  DISCIPLINE_TRANSLATIONS,
  EXERCISE_TRANSLATIONS,
  SPORT_CATEGORIES,
  getTranslatedDiscipline,
  getTranslatedExercise,
  getTranslatedSportCategory,
} from "@/utl/sportTranslations";

describe("getTranslatedSportCategory", () => {
  it("traduce una categoría conocida en los tres idiomas", () => {
    expect(getTranslatedSportCategory("athletics", "es")).toBe("Atletismo");
    expect(getTranslatedSportCategory("athletics", "ing")).toBe("Athletics");
    expect(getTranslatedSportCategory("athletics", "eus")).toBe("Atletismoa");
  });

  it("devuelve la clave original si no hay traducción", () => {
    expect(getTranslatedSportCategory("curling", "ing")).toBe("curling");
  });

  it("cae a español con un idioma desconocido o vacío", () => {
    expect(getTranslatedSportCategory("soccer", "fr")).toBe(SPORT_CATEGORIES.es.soccer);
    expect(getTranslatedSportCategory("soccer", "")).toBe(SPORT_CATEGORIES.es.soccer);
  });
});

describe("getTranslatedDiscipline", () => {
  it("conserva la clave interna en español y traduce solo la etiqueta", () => {
    const key = "Lanz. Jabalina";
    expect(getTranslatedDiscipline(key, "es")).toBe(key);
    expect(getTranslatedDiscipline(key, "ing")).not.toBe(key);
  });

  it("devuelve la clave si la disciplina no existe", () => {
    expect(getTranslatedDiscipline("Disciplina inventada", "ing")).toBe("Disciplina inventada");
  });
});

describe("getTranslatedExercise", () => {
  it("traduce los ejercicios por defecto", () => {
    expect(getTranslatedExercise("Sentadilla", "ing")).toBe("Squat");
    expect(getTranslatedExercise("Peso Muerto", "eus")).toBe("Pisu Hilak");
  });
});

describe("integridad de las tablas de traducción", () => {
  it.each(["ing", "eus"] as const)("%s cubre las mismas claves que es", (lang) => {
    expect(Object.keys(SPORT_CATEGORIES[lang]).sort()).toEqual(Object.keys(SPORT_CATEGORIES.es).sort());
    expect(Object.keys(EXERCISE_TRANSLATIONS[lang]).sort()).toEqual(
      Object.keys(EXERCISE_TRANSLATIONS.es).sort(),
    );
    expect(Object.keys(DISCIPLINE_TRANSLATIONS[lang]).sort()).toEqual(
      Object.keys(DISCIPLINE_TRANSLATIONS.es).sort(),
    );
  });
});
