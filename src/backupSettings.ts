export type BackupSettings = {
  destination: string; enabled: boolean; lastAttempt: number; lastSuccess: number; lastPath: string; lastError: string;
};
export const backupInterval = 15 * 60 * 1000;
export const emptyBackupSettings: BackupSettings = { destination: "", enabled: false, lastAttempt: 0, lastSuccess: 0, lastPath: "", lastError: "" };
export const backupSettingsKey = (project: string) => `ouroborocessor.backup.v1:${project}`;
export function readBackupSettings(project: string): BackupSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(backupSettingsKey(project)) ?? "null") as Partial<BackupSettings> | null;
    if (!raw || typeof raw !== "object") return { ...emptyBackupSettings };
    const destination = typeof raw.destination === "string" ? raw.destination : "";
    const timestamp = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
    return { destination, enabled: Boolean(destination) && raw.enabled === true,
      lastAttempt: timestamp(raw.lastAttempt), lastSuccess: timestamp(raw.lastSuccess),
      lastPath: typeof raw.lastPath === "string" ? raw.lastPath : "", lastError: typeof raw.lastError === "string" ? raw.lastError : "" };
  } catch { return { ...emptyBackupSettings }; }
}
export function backupDue(settings: BackupSettings, now: number) {
  return settings.enabled && Boolean(settings.destination)
    && (now < settings.lastAttempt || now - settings.lastAttempt >= backupInterval);
}
