import { afterEach, describe, expect, it, vi } from "vitest";
import { backupDue, backupInterval, emptyBackupSettings, readBackupSettings } from "./backupSettings";

afterEach(() => vi.unstubAllGlobals());
describe("automatic backup scheduling", () => {
  it("requires opt-in and a destination, waits 15 minutes, and recovers from a clock rollback", () => {
    expect(backupDue(emptyBackupSettings, Date.now())).toBe(false);
    const configured = { ...emptyBackupSettings, enabled: true, destination: "/backup", lastAttempt: 1000 };
    expect(backupDue(configured, 1000 + backupInterval - 1)).toBe(false);
    expect(backupDue(configured, 1000 + backupInterval)).toBe(true);
    expect(backupDue(configured, 500)).toBe(true);
    expect(backupDue({ ...configured, destination: "" }, Date.now())).toBe(false);
    expect(backupDue({ ...configured, enabled: false }, Date.now())).toBe(false);
  });
  it("spaces retries after failures instead of retrying at each timer tick", () => {
    const failed = { ...emptyBackupSettings, enabled: true, destination: "/backup", lastAttempt: 5000, lastError: "STORAGE_FULL" };
    expect(backupDue(failed, 35000)).toBe(false);
    expect(backupDue(failed, 5000 + backupInterval)).toBe(true);
  });
  it("rejects corrupt settings and preserves project-specific records", () => {
    const getItem = vi.fn((key: string) => key.endsWith("/one") ? JSON.stringify({ enabled: true, destination: "/backup", lastAttempt: -1, lastPath: 42 }) : "broken");
    vi.stubGlobal("localStorage", { getItem });
    expect(readBackupSettings("/one")).toEqual({ ...emptyBackupSettings, destination: "/backup", enabled: true });
    expect(readBackupSettings("/two")).toEqual(emptyBackupSettings);
  });
});
