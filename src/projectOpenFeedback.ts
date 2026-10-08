import { localizedError } from "./appText";
import { featureText } from "./featureText";
import { translate, type Locale } from "./i18n";
import { ProjectSceneSaveError } from "./projectSave";

export type ProjectOpenStage = "save" | "open";

export function projectOpenFeedback(reason: unknown, locale: Locale, stage: ProjectOpenStage) {
  if (stage === "save") {
    const detail = reason instanceof ProjectSceneSaveError
      ? `${reason.sceneTitle} · ${reason.stage === "recovery" ? translate(locale, "recoveryFailed") : localizedError(reason.reason, locale)}`
      : localizedError(reason, locale);
    return `${featureText[locale].switchSaveFailed} ${detail}`;
  }
  const detail = localizedError(reason, locale);
  return detail === translate(locale, "genericError") ? featureText[locale].missingProject : detail;
}
