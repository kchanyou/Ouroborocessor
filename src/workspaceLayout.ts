export const layoutKey = "ouroborocessor.workspace.v1";
export const defaultLayout = { navigator: true, inspector: false, navigatorWidth: 240, inspectorWidth: 280, sideWidth: 440 };
export const sideWidthRange = { min: 280, max: 760 } as const;
export type WorkspaceLayout = typeof defaultLayout;
export function normalizeLayout(value: unknown): WorkspaceLayout {
  const input = value && typeof value === "object" ? value as Partial<WorkspaceLayout> : {};
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  return { navigator: typeof input.navigator === "boolean" ? input.navigator : true, inspector: typeof input.inspector === "boolean" ? input.inspector : false,
    navigatorWidth: number(input.navigatorWidth, 240, 190, 360), inspectorWidth: number(input.inspectorWidth, 280, 240, 380),
    sideWidth: number(input.sideWidth, 440, sideWidthRange.min, sideWidthRange.max) };
}
export function readLayout(): WorkspaceLayout {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(layoutKey) ?? "null")); } catch { return { ...defaultLayout }; }
}
export const layoutText = {
  ko: { title: "화면 배치", navigator: "원고 목록 너비", inspector: "원고 정보 너비", reset: "초기화", resize: "너비 조절", hint: "넓은 창에서는 패널 가장자리를 끌어서 조절할 수도 있어요.", side: "옆 창 너비" },
  en: { title: "Layout", navigator: "Outline width", inspector: "Details width", reset: "Reset layout", resize: "Resize panel", hint: "In wider windows, you can also drag the edge of a panel.", side: "Side pane width" },
  es: { title: "Distribución de pantalla", navigator: "Ancho del índice", inspector: "Ancho de detalles", reset: "Restablecer", resize: "Ajustar ancho", hint: "En ventanas anchas, también puedes arrastrar el borde del panel.", side: "Ancho del panel lateral" },
  ja: { title: "画面配置", navigator: "原稿リストの幅", inspector: "原稿情報の幅", reset: "標準配置", resize: "幅を調整", hint: "広いウィンドウでは、パネルの端をドラッグしても調整できます。", side: "サイドペインの幅" },
  zh: { title: "界面布局", navigator: "文稿列表宽度", inspector: "文稿信息宽度", reset: "默认布局", resize: "调整宽度", hint: "窗口较宽时，也可以拖动面板边缘调整。", side: "侧边窗格宽度" },
};
