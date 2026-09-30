import type { CSSProperties } from "react";
import type { Locale } from "./i18n";
import { editorThemes, fontPreferences, sanitizeFontName, type EditorTheme, type FontPreference, type WritingPreferences } from "./preferences";

type Palette = { page: string; ink: string; muted: string; dark: boolean };

// auto = app theme, custom = user's two colors
const palettes: Record<Exclude<EditorTheme, "auto" | "custom">, Palette> = {
  paper: { page: "#fbf8f1", ink: "#2b2926", muted: "#6d675e", dark: false },
  sepia: { page: "#f1e6d0", ink: "#43372a", muted: "#7a6a55", dark: false },
  mist: { page: "#e9eeeb", ink: "#26302b", muted: "#5d6a63", dark: false },
  slate: { page: "#2a2f35", ink: "#dfe3e8", muted: "#9aa3ad", dark: true },
  night: { page: "#15171a", ink: "#cfd3d8", muted: "#8a9098", dark: true },
};

const serifStack = `"New York", "Iowan Old Style", "Noto Serif KR", "Noto Serif JP", "Noto Serif SC", "Nanum Myeongjo", Georgia, serif`;

export const fontStacks: Record<Exclude<FontPreference, "custom">, string> = {
  serif: serifStack,
  sans: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans KR", "Noto Sans JP", "Noto Sans SC", "Segoe UI", sans-serif`,
  rounded: `ui-rounded, "SF Pro Rounded", "NanumSquareRound", "Nanum Square Round", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`,
  mono: `"SFMono-Regular", "Cascadia Mono", "Noto Sans Mono CJK KR", "Noto Sans Mono", Consolas, monospace`,
};

// can't list installed fonts in the WebView, so just suggest common ones
const fontSuggestions = ["Apple SD Gothic Neo", "AppleMyungjo", "Nanum Gothic", "Nanum Myeongjo", "Nanum Pen Script", "Pretendard", "Noto Serif KR", "Hiragino Mincho ProN", "Palatino", "Baskerville", "Georgia", "Avenir Next", "Helvetica Neue"];

function isDarkColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

function paletteFor(prefs: WritingPreferences): Palette | null {
  if (prefs.editorTheme === "auto") return null;
  if (prefs.editorTheme === "custom") {
    return { page: prefs.customBackground, ink: prefs.customText, muted: `color-mix(in srgb, ${prefs.customText} 62%, ${prefs.customBackground})`, dark: isDarkColor(prefs.customBackground) };
  }
  return palettes[prefs.editorTheme];
}

export function customFontStack(name: string) {
  const clean = sanitizeFontName(name);
  return clean ? `"${clean}", ${serifStack}` : serifStack;
}

export function editorAppearanceStyle(prefs: WritingPreferences): CSSProperties {
  const palette = paletteFor(prefs);
  const style: Record<string, string> = { "--editor-font": prefs.fontFamily === "custom" ? customFontStack(prefs.customFont) : fontStacks[prefs.fontFamily] };
  if (palette) {
    Object.assign(style, {
      "--editor": palette.page,
      "--ink": palette.ink,
      "--ink-secondary": palette.muted,
      "--ink-tertiary": palette.muted,
      "--line": `color-mix(in srgb, ${palette.ink} 14%, transparent)`,
      "--line-strong": `color-mix(in srgb, ${palette.ink} 28%, transparent)`,
      "--control": `color-mix(in srgb, ${palette.page} 94%, ${palette.ink})`,
      "--control-hover": `color-mix(in srgb, ${palette.ink} 8%, transparent)`,
      colorScheme: palette.dark ? "dark" : "light",
      color: palette.ink,
    });
  }
  return style as CSSProperties;
}

export const editorText = {
  ko: { title: "에디터", theme: "배경", font: "글꼴", auto: "앱 테마", paper: "종이", sepia: "세피아", mist: "안개", slate: "슬레이트", night: "밤", custom: "직접 지정",
    background: "배경색", text: "글자색", serif: "명조", sans: "고딕", rounded: "둥근 고딕", mono: "고정폭", customFont: "설치된 글꼴", customFontPlaceholder: "글꼴 이름 (예: Pretendard)",
    customFontHint: "이 컴퓨터에 설치된 글꼴 이름을 입력하세요. 찾지 못하면 명조로 표시돼요." },
  en: { title: "Editor", theme: "Background", font: "Font", auto: "App theme", paper: "Paper", sepia: "Sepia", mist: "Mist", slate: "Slate", night: "Night", custom: "Custom",
    background: "Background", text: "Text", serif: "Serif", sans: "Sans serif", rounded: "Rounded", mono: "Monospace", customFont: "Installed font", customFontPlaceholder: "Font name (e.g. Pretendard)",
    customFontHint: "Enter the name of a font installed on this computer. If it isn't found, serif is used." },
  es: { title: "Editor", theme: "Fondo", font: "Fuente", auto: "Tema de la app", paper: "Papel", sepia: "Sepia", mist: "Niebla", slate: "Pizarra", night: "Noche", custom: "Personalizado",
    background: "Fondo", text: "Texto", serif: "Serif", sans: "Sans serif", rounded: "Redondeada", mono: "Monoespaciada", customFont: "Fuente instalada", customFontPlaceholder: "Nombre de la fuente (p. ej., Pretendard)",
    customFontHint: "Escribe el nombre de una fuente instalada en este equipo. Si no se encuentra, se usa una serif." },
  ja: { title: "エディタ", theme: "背景", font: "フォント", auto: "アプリのテーマ", paper: "紙", sepia: "セピア", mist: "霧", slate: "スレート", night: "夜", custom: "カスタム",
    background: "背景色", text: "文字色", serif: "明朝", sans: "ゴシック", rounded: "丸ゴシック", mono: "等幅", customFont: "インストール済みフォント", customFontPlaceholder: "フォント名（例：Pretendard）",
    customFontHint: "このコンピュータにインストールされているフォント名を入力してください。見つからない場合は明朝で表示されます。" },
  zh: { title: "编辑器", theme: "背景", font: "字体", auto: "跟随应用", paper: "纸张", sepia: "复古", mist: "雾", slate: "石板", night: "夜间", custom: "自定义",
    background: "背景色", text: "文字颜色", serif: "宋体", sans: "黑体", rounded: "圆体", mono: "等宽", customFont: "已安装字体", customFontPlaceholder: "字体名称（例如 Pretendard）",
    customFontHint: "输入此电脑上已安装的字体名称。找不到时将使用宋体显示。" },
};

export function EditorAppearanceSettings({ locale, value, onChange }: {
  locale: Locale; value: WritingPreferences; onChange: (next: WritingPreferences) => void;
}) {
  const t = editorText[locale];
  const set = <K extends keyof WritingPreferences>(key: K, next: WritingPreferences[K]) => onChange({ ...value, [key]: next });
  return <section className="settings-section editor-appearance" aria-labelledby="editor-settings">
    <h3 id="editor-settings">{t.title}</h3>
    <fieldset className="choice-group">
      <legend>{t.theme}</legend>
      <div className="theme-swatches">
        {editorThemes.map((theme) => {
          const palette = theme === "auto" ? null : theme === "custom" ? { page: value.customBackground, ink: value.customText } : palettes[theme];
          return <label key={theme} className="theme-swatch">
            <input type="radio" name="editor-theme" value={theme} checked={value.editorTheme === theme} onChange={() => set("editorTheme", theme)} />
            <span className={`swatch swatch-${theme}`} aria-hidden="true" style={palette ? { background: palette.page, color: palette.ink } : undefined}>가</span>
            <span className="choice-label">{t[theme]}</span>
          </label>;
        })}
      </div>
    </fieldset>
    {value.editorTheme === "custom" && <div className="custom-colors">
      <label className="color-field"><input type="color" value={value.customBackground} onChange={(event) => set("customBackground", event.target.value)} />{t.background}</label>
      <label className="color-field"><input type="color" value={value.customText} onChange={(event) => set("customText", event.target.value)} />{t.text}</label>
    </div>}
    <fieldset className="choice-group">
      <legend>{t.font}</legend>
      <div className="font-cards">
        {fontPreferences.map((font) => <label key={font} className="font-card">
          <input type="radio" name="editor-font" value={font} checked={value.fontFamily === font} onChange={() => set("fontFamily", font)} />
          <span className="font-sample" aria-hidden="true" style={{ fontFamily: font === "custom" ? customFontStack(value.customFont) : fontStacks[font] }}>가나 Aa</span>
          <span className="choice-label">{font === "custom" ? t.customFont : t[font]}</span>
        </label>)}
      </div>
    </fieldset>
    {value.fontFamily === "custom" && <label className="custom-font-field">
      <span className="sr-only">{t.customFont}</span>
      <input type="text" list="font-suggestions" value={value.customFont} placeholder={t.customFontPlaceholder} spellCheck={false}
        onChange={(event) => set("customFont", event.target.value.replace(/["'\\;{}<>]/g, "").slice(0, 80))} />
      <datalist id="font-suggestions">{fontSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
      <small>{t.customFontHint}</small>
    </label>}
  </section>;
}
