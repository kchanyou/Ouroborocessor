export const layoutKey = "ouroborocessor.workspace.v1";
export type SplitDirection = "right" | "left" | "down" | "up";
export const defaultLayout = { navigator: true, inspector: false, navigatorWidth: 240, inspectorWidth: 280, sideWidth: 440, splitDirection: "right" as SplitDirection, splitRatio: 0.5 };
export const sideWidthRange = { min: 280, max: 760 } as const;
export type WorkspaceLayout = typeof defaultLayout;
export function normalizeLayout(value: unknown): WorkspaceLayout {
  const input = value && typeof value === "object" ? value as Partial<WorkspaceLayout> : {};
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  return { navigator: typeof input.navigator === "boolean" ? input.navigator : true, inspector: typeof input.inspector === "boolean" ? input.inspector : false,
    navigatorWidth: number(input.navigatorWidth, 240, 190, 360), inspectorWidth: number(input.inspectorWidth, 280, 240, 380),
    sideWidth: number(input.sideWidth, 440, sideWidthRange.min, sideWidthRange.max),
    splitDirection: ["right", "left", "down", "up"].includes(input.splitDirection ?? "") ? input.splitDirection! : "right",
    splitRatio: typeof input.splitRatio === "number" && Number.isFinite(input.splitRatio) ? Math.min(0.85, Math.max(0.15, input.splitRatio)) : 0.5 };
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

export const splitText = {
  ko: { title: "창 나누기", right: "오른쪽으로 분할", left: "왼쪽으로 분할", down: "아래로 분할", up: "위로 분할", equal: "동일한 크기로 맞추기", resize: "분할 크기 조절", hint: "창이 좁아져도 선택한 분할 방향을 유지해요." },
  en: { title: "Split editor", right: "Split right", left: "Split left", down: "Split down", up: "Split up", equal: "Equalize groups", resize: "Resize split", hint: "Your split direction stays the same when the window gets narrower." },
  es: { title: "Dividir editor", right: "Dividir a la derecha", left: "Dividir a la izquierda", down: "Dividir abajo", up: "Dividir arriba", equal: "Igualar tamaños", resize: "Ajustar división", hint: "La dirección elegida se mantiene al reducir la ventana." },
  ja: { title: "エディタを分割", right: "右に分割", left: "左に分割", down: "下に分割", up: "上に分割", equal: "同じ大きさにする", resize: "分割サイズを調整", hint: "ウィンドウが狭くなっても分割方向を維持します。" },
  zh: { title: "拆分编辑器", right: "向右拆分", left: "向左拆分", down: "向下拆分", up: "向上拆分", equal: "平均分配大小", resize: "调整拆分大小", hint: "窗口变窄时仍保持所选拆分方向。" },
};

export function splitRatioAt(direction: SplitDirection, x: number, y: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
  const horizontal = direction === "left" || direction === "right";
  const size = horizontal ? rect.width : rect.height;
  if (size <= 0) return 0.5;
  const offset = horizontal ? (x - rect.left) / size : (y - rect.top) / size;
  return Math.min(0.85, Math.max(0.15, direction === "right" || direction === "down" ? 1 - offset : offset));
}
