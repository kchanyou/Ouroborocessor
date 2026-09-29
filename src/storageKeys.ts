const LEGACY_PREFIX = "local-writer";

// These values predate the product name. Keep them stable so upgrades retain
// preferences, the recent project, and recovery drafts.
export const storageKeys = {
  appPreferences: `${LEGACY_PREFIX}.app-preferences.v1`,
  writingPreferences: `${LEGACY_PREFIX}.writing-preferences.v1`,
  lastProject: `${LEGACY_PREFIX}.last-project`,
  recoveryDraft(projectPath: string, sceneId: string) {
    return `${LEGACY_PREFIX}.recovery.v1:${JSON.stringify([projectPath, sceneId])}`;
  },
};
