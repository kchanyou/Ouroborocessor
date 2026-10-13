import { describe, expect, it } from "vitest";
import { localizedError } from "./appText";
import { translate, type Locale } from "./i18n";
import { ProjectSceneSaveError } from "./projectSave";

describe("project switch save errors", () => {
  it.each<Locale>(["ko", "en", "es", "ja", "zh"])("distinguishes recovery cleanup from manuscript write failures in %s", locale => {
    const reason = new Error("STORAGE_PERMISSION");
    expect(localizedError(new ProjectSceneSaveError("Scene", reason, "recovery"), locale))
      .toBe(translate(locale, "recoveryFailed"));
    expect(localizedError(new ProjectSceneSaveError("Scene", reason, "save"), locale))
      .toBe(translate(locale, "storagePermissionError"));
    expect(localizedError(new ProjectSceneSaveError("Scene", "SAVE_CONFLICT", "save"), locale))
      .toBe(translate(locale, "saveConflict"));
  });
});
