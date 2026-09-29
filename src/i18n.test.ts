import { describe, expect, it } from "vitest";
import { detectLocale, localeOptions, messages, translate } from "./i18n";

describe("internationalization", () => {
  it("uses the product name in all five interfaces", () => {
    for (const { code } of localeOptions) {
      expect(translate(code, "appName")).toBe("Ouroborocessor");
    }
  });
  it("contains the same message keys for every supported locale", () => {
    const koreanKeys = Object.keys(messages.ko).sort();
    for (const { code } of localeOptions) {
      expect(Object.keys(messages[code]).sort()).toEqual(koreanKeys);
    }
  });

  it("detects all supported languages and falls back to English", () => {
    expect(detectLocale("ko-KR")).toBe("ko");
    expect(detectLocale("es-MX")).toBe("es");
    expect(detectLocale("ja-JP")).toBe("ja");
    expect(detectLocale("zh-CN")).toBe("zh");
    expect(detectLocale("fr-FR")).toBe("en");
  });

  it("interpolates translated values", () => {
    expect(translate("en", "itemCount", { count: 3 })).toBe("3 items");
  });
});
