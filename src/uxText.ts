import type { Locale } from "./i18n";

const en = {
  project: "Project", newScene: "New document", sceneActions: "Document actions",
  exportManuscript: "Export manuscript", backupProject: "Back up project",
  searchProject: "Search all", findScene: "Find in text", research: "Research",
  writingSettings: "Writing appearance", writingHint: "Changes apply to both editor panes.",
  sample: "Every story begins with a single sentence. Take a breath, and write the next one.",
};
export const uxText: Record<Locale, typeof en> = {
  en,
  ko: { project: "프로젝트", newScene: "새 원고", sceneActions: "원고 작업", exportManuscript: "원고 내보내기", backupProject: "프로젝트 백업", searchProject: "전체 검색", findScene: "본문 찾기", research: "레퍼런스", writingSettings: "집필 화면", writingHint: "양쪽 편집 창에 함께 적용돼요.", sample: "모든 이야기는 한 문장에서 시작됩니다. 잠시 숨을 고르고, 다음 문장을 써 내려갑니다." },
  es: { project: "Proyecto", newScene: "Nuevo documento", sceneActions: "Acciones del documento", exportManuscript: "Exportar manuscrito", backupProject: "Respaldar proyecto", searchProject: "Buscar en todo", findScene: "Buscar en texto", research: "Referencias", writingSettings: "Aspecto de escritura", writingHint: "Los cambios se aplican a ambos paneles del editor.", sample: "Toda historia empieza con una frase. Respira y escribe la siguiente." },
  ja: { project: "プロジェクト", newScene: "新しい原稿", sceneActions: "原稿の操作", exportManuscript: "原稿を書き出す", backupProject: "プロジェクトをバックアップ", searchProject: "全体を検索", findScene: "本文を検索", research: "資料", writingSettings: "執筆画面", writingHint: "両方の編集ペインに適用されます。", sample: "すべての物語は一文から始まります。ひと息ついて、次の一文を書きましょう。" },
  zh: { project: "项目", newScene: "新建文稿", sceneActions: "文稿操作", exportManuscript: "导出文稿", backupProject: "备份项目", searchProject: "全部搜索", findScene: "查找正文", research: "资料", writingSettings: "写作外观", writingHint: "更改会应用于两个编辑窗格。", sample: "每个故事都从一句话开始。深呼吸，继续写下下一句。" },
};
