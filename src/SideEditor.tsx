import { useMemo, type Ref } from "react";
import type { Locale } from "./i18n";
import { statusLabel, type Translate } from "./appText";
import type { ManuscriptNode } from "./types";
import type { WritingPreferences } from "./preferences";
import { ManuscriptEditor, type EditorPort } from "./ManuscriptEditor";
import { getCharacterCount } from "./textMetrics";
import { readableResourceText } from "./resourceLinks";

// parent saves via onChange
export function SideEditor({ scene, number, projectPath, locale, t, preferences, editorRef, onChange, onComposition, onImageRejected, imageUnsupported, imageMainOnly }: {
  scene: ManuscriptNode; number: number; projectPath: string; locale: Locale; t: Translate;
  preferences: WritingPreferences; editorRef: Ref<EditorPort>;
  onChange: (content: string) => void; onComposition: (active: boolean) => void;
  onImageRejected: (message: string) => void; imageUnsupported: string; imageMainOnly: string;
}) {
  const characters = useMemo(() => getCharacterCount(readableResourceText(scene.content)), [scene.content]);
  return <main className="side-editor" aria-labelledby="side-item-title">
    <header className="editor-heading">
      <p>{t("sceneNumber", { number })}</p>
      <h1 id="side-item-title">{scene.title}</h1>
      <span>{statusLabel(scene.status, t)}</span>
    </header>
    <ManuscriptEditor key={`side:${projectPath}:${scene.id}`} projectPath={projectPath} sceneId={scene.id} pane="side" ref={editorRef} editorId="side-editor"
      label={`${scene.title} · ${t("scene")}`} content={scene.content} preferences={preferences}
      onChange={onChange} onComposition={onComposition}
      onImages={() => onImageRejected(imageMainOnly)} onImageError={() => onImageRejected(imageUnsupported)} onImageSelect={() => {}}
      onKeyDown={() => {}} placeholder={t("startScene")} />
    <footer className="editor-status" aria-label={t("currentSceneStats")}>
      <span>{t("charactersShort", { count: characters.toLocaleString(locale) })}</span>
    </footer>
  </main>;
}
