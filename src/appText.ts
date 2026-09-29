import { translate, type Locale, type MessageKey } from "./i18n";

export type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string;

const metadataConflict = {
  ko: "다른 앱에서 원고 정보가 바뀌었어요. 지금 입력한 내용을 복사해 둔 뒤 프로젝트를 다시 열어 주세요.",
  en: "Item details changed outside the app. Copy your current input, then reopen the project to review both versions.",
  es: "Los datos del elemento cambiaron fuera de la aplicación. Copia lo que escribiste y vuelve a abrir el proyecto para revisarlo.",
  ja: "項目情報が外部で変更されました。現在の入力をコピーしてから、プロジェクトを開き直して確認してください。",
  zh: "项目信息已在应用外被修改。请先复制当前输入，再重新打开项目核对。",
} as const;

export function localizedError(error: unknown, locale: Locale) {
  const message = String(error);
  if (message.includes("METADATA_CONFLICT")) return metadataConflict[locale];
  if (message.includes("HISTORY_CONFLICT")) return translate(locale, "editHistoryConflict");
  if (message.includes("HISTORY_EMPTY")) return translate(locale, "editHistoryEmpty");
  if (message.includes("SAVE_CONFLICT")) return translate(locale, "saveConflict");
  if (message.includes("STORAGE_PERMISSION")) return translate(locale, "storagePermissionError");
  if (message.includes("STORAGE_FULL")) return translate(locale, "storageFullError");
  if (message.includes("STORAGE_WRITE")) return translate(locale, "storageWriteError");
  return translate(locale, "genericError");
}

export function isCompactViewport() {
  return window.matchMedia("(max-width: 780px)").matches;
}

export const imageDropText = {
  ko: { prompt: "여기에 놓으면 이미지가 추가돼요", unsupported: "지원 이미지 형식: PNG, JPEG, GIF, WebP · 파일당 최대 10MB", added: "이미지 {count}개를 추가했어요.", failed: "이미지를 추가하지 못했어요. 형식, 용량, 파일 권한을 확인하세요." },
  en: { prompt: "Drop to add images", unsupported: "Supported images: PNG, JPEG, GIF, WebP · up to 10 MB each", added: "Added {count} images.", failed: "Could not add images. Check the format, size, and file access." },
  es: { prompt: "Suelta para añadir imágenes", unsupported: "Imágenes admitidas: PNG, JPEG, GIF, WebP · máximo 10 MB cada una", added: "Se añadieron {count} imágenes.", failed: "No se pudieron añadir las imágenes. Comprueba el formato, el tamaño y el acceso." },
  ja: { prompt: "ここにドロップすると画像を追加します", unsupported: "対応画像: PNG、JPEG、GIF、WebP · 1ファイル最大10 MB", added: "画像を{count}件追加しました。", failed: "画像を追加できませんでした。形式、容量、ファイル権限を確認してください。" },
  zh: { prompt: "拖放到此处添加图片", unsupported: "支持图片：PNG、JPEG、GIF、WebP · 每个文件最大10 MB", added: "已添加{count}张图片。", failed: "无法添加图片。请检查格式、大小和文件权限。" },
} as const;

export const imageInspectorText = {
  ko: { title: "이미지", alt: "대체 텍스트", altHint: "이미지 내용을 짧게 설명해 주세요", file: "파일", replace: "파일 교체", remove: "본문에서 삭제" },
  en: { title: "Image", alt: "Alternative text", altHint: "Briefly describe the image's meaning", file: "File", replace: "Replace file", remove: "Remove from manuscript" },
  es: { title: "Imagen", alt: "Texto alternativo", altHint: "Describe brevemente el significado de la imagen", file: "Archivo", replace: "Reemplazar archivo", remove: "Quitar del manuscrito" },
  ja: { title: "画像", alt: "代替テキスト", altHint: "画像の内容を短く説明してください", file: "ファイル", replace: "ファイルを置換", remove: "本文から削除" },
  zh: { title: "图片", alt: "替代文本", altHint: "请简要描述图片内容", file: "文件", replace: "替换文件", remove: "从正文移除" },
} as const;

export function statusLabel(status: string, t: Translate) {
  if (status === "draft" || status === "초안") return t("draft");
  if (status === "revised") return t("revised");
  if (status === "complete") return t("complete");
  return status || t("draft");
}
