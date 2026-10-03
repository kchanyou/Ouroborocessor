import type { Locale } from "./i18n";

const en = {
  recentProjects: "Recent projects",
  reconnect: "Find new location",
  openFolder: "Open another folder",
  reopenTab: "Reopen closed tab",
  noRecent: "No recent projects.",
  missingProject: "Couldn’t open this project. If you moved its folder, find the new location.",
};

export const featureText: Record<Locale, typeof en> = {
  en,
  ko: {
    recentProjects: "최근 프로젝트",
    reconnect: "새 위치 찾기",
    openFolder: "다른 폴더 열기",
    reopenTab: "닫은 탭 다시 열기",
    noRecent: "최근에 연 프로젝트가 없어요.",
    missingProject: "프로젝트를 열지 못했어요. 폴더를 옮겼다면 새 위치를 찾아 주세요.",
  },
  es: {
    recentProjects: "Proyectos recientes",
    reconnect: "Buscar nueva ubicación",
    openFolder: "Abrir otra carpeta",
    reopenTab: "Reabrir pestaña cerrada",
    noRecent: "No hay proyectos recientes.",
    missingProject: "No se pudo abrir el proyecto. Si moviste su carpeta, busca la nueva ubicación.",
  },
  ja: {
    recentProjects: "最近のプロジェクト",
    reconnect: "新しい場所を探す",
    openFolder: "別のフォルダを開く",
    reopenTab: "閉じたタブを開き直す",
    noRecent: "最近開いたプロジェクトはありません。",
    missingProject: "プロジェクトを開けませんでした。フォルダを移動した場合は、新しい場所を指定してください。",
  },
  zh: {
    recentProjects: "最近的项目",
    reconnect: "查找新位置",
    openFolder: "打开其他文件夹",
    reopenTab: "重新打开已关闭的标签页",
    noRecent: "没有最近打开的项目。",
    missingProject: "无法打开此项目。如果移动过文件夹，请找到新的位置。",
  },
};
