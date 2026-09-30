const LEGACY_PREFIX = "local-writer";

// old names from before the rename. don't change or upgrades lose settings/drafts
export const storageKeys = {
  appPreferences: `${LEGACY_PREFIX}.app-preferences.v1`,
  writingPreferences: `${LEGACY_PREFIX}.writing-preferences.v1`,
  lastProject: `${LEGACY_PREFIX}.last-project`,
  recoveryDraft(projectPath: string, sceneId: string) {
    return `${LEGACY_PREFIX}.recovery.v1:${JSON.stringify([projectPath, sceneId])}`;
  },
};
