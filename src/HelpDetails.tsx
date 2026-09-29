import type { Locale } from "./i18n";

const labels = { ko: "자세히 보기", en: "Details", es: "Más información", ja: "詳しく見る", zh: "查看详情" };

export function HelpDetails({ locale, children }: { locale: Locale; children: string }) {
  return <details className="help-details"><summary>{labels[locale]}</summary><p>{children}</p></details>;
}
