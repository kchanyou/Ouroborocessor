import type { ManuscriptNode } from "./types";
import type { Locale } from "./i18n";
import type { Translate } from "./appText";
import { imageInspectorText } from "./appText";
import type { WritingPreferences } from "./preferences";
import type { getTextMetrics } from "./textMetrics";
import { NumericSetting } from "./NumericSetting";
import { PanelResize } from "./WorkspaceControls";
import { layoutText } from "./workspaceLayout";

type Metadata = Partial<Pick<ManuscriptNode, "title" | "status" | "synopsis">>;

export function InspectorPanel({ locale, t, isMac, width, onResize, image, altDraft, onAltDraftChange, onAltCommit, onReplaceImage, onRemoveImage,
  selectedNode, selectedScene, position, onOpenHistory, onMetadataChange, onMetadataCommit, metrics, writing, onWritingChange }: {
  locale: Locale; t: Translate; isMac: boolean; width: number; onResize: (width: number) => void;
  image: { name: string; alt: string } | null; altDraft: string; onAltDraftChange: (value: string) => void; onAltCommit: (value: string) => void;
  onReplaceImage: () => void; onRemoveImage: () => void;
  selectedNode: ManuscriptNode | null; selectedScene: ManuscriptNode | null; position: { index: number; count: number };
  onOpenHistory: () => void; onMetadataChange: (changes: Metadata) => void; onMetadataCommit: () => void;
  metrics: ReturnType<typeof getTextMetrics>;
  writing: WritingPreferences; onWritingChange: <K extends keyof WritingPreferences>(key: K, value: WritingPreferences[K]) => void;
}) {
  const imageT = imageInspectorText[locale];
  return (
    <aside className="inspector" aria-labelledby="inspector-title">
      <PanelResize side="left" value={width} min={240} max={380} label={layoutText[locale].inspector} onChange={onResize} />
      <div className="panel-heading inspector-heading"><h2 id="inspector-title">{t("inspector")}</h2></div>

      {image && (
        <details className="inspector-section image-inspector" open>
          <summary>{imageT.title}</summary>
          <dl className="metadata"><div><dt>{imageT.file}</dt><dd title={image.name}>{image.name}</dd></div></dl>
          <label className="inspector-field">
            <span>{imageT.alt}</span>
            <input value={altDraft} placeholder={imageT.altHint} onChange={(event) => onAltDraftChange(event.target.value)}
              onBlur={(event) => onAltCommit(event.currentTarget.value)} onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { event.currentTarget.value = image.alt; onAltDraftChange(image.alt); event.currentTarget.blur(); }
              }} />
          </label>
          <div className="image-inspector-actions">
            <button type="button" onClick={onReplaceImage}>{imageT.replace}</button>
            <button type="button" className="danger-action" onClick={onRemoveImage}>{imageT.remove}</button>
          </div>
        </details>
      )}

      {selectedNode && (
        <details className="inspector-section" open>
          <summary>{t("itemInformation")}</summary>
          {selectedScene && <button type="button" className="toolbar-button" onClick={onOpenHistory}>{t("sceneHistory")}</button>}
          <label className="inspector-field">
            <span>{t("title")}</span>
            <input value={selectedNode.title} onChange={(event) => onMetadataChange({ title: event.target.value })} onBlur={onMetadataCommit} />
          </label>
          <dl className="metadata">
            <div><dt>{t("type")}</dt><dd>{selectedNode.kind === "group" ? t("group") : t("scene")}</dd></div>
            <div><dt>{t("position")}</dt><dd>{position.index + 1} / {position.count}</dd></div>
          </dl>
          {selectedScene && (
            <>
              <label className="inspector-field">
                <span>{t("status")}</span>
                <select value={selectedScene.status === "초안" ? "draft" : selectedScene.status} onChange={(event) => onMetadataChange({ status: event.target.value })} onBlur={onMetadataCommit}>
                  <option value="draft">{t("draft")}</option>
                  <option value="revised">{t("revised")}</option>
                  <option value="complete">{t("complete")}</option>
                </select>
              </label>
              <label className="inspector-field">
                <span>{t("notes")}</span>
                <textarea value={selectedScene.synopsis} onChange={(event) => onMetadataChange({ synopsis: event.target.value })} onBlur={onMetadataCommit} placeholder={t("notesPlaceholder")} />
              </label>
            </>
          )}
        </details>
      )}

      {selectedScene && (
        <>
          <details className="inspector-section">
            <summary>{t("statistics")}</summary>
            <dl className="metrics">
              <div><dt>{t("charsWithSpaces")}</dt><dd>{metrics.charactersWithSpaces.toLocaleString(locale)}</dd></div>
              <div><dt>{t("charsWithoutSpaces")}</dt><dd>{metrics.charactersWithoutSpaces.toLocaleString(locale)}</dd></div>
              <div><dt>{t("words")}</dt><dd>{metrics.words.toLocaleString(locale)}</dd></div>
              <div><dt>{t("paragraphs")}</dt><dd>{metrics.paragraphs.toLocaleString(locale)}</dd></div>
              <div><dt>{t("manuscriptPaper")}</dt><dd>{t("sheets", { count: metrics.manuscriptPages.toFixed(1) })}</dd></div>
            </dl>
          </details>

          <details className="inspector-section">
            <summary>{t("writingView")}</summary>
            <fieldset className="typography-settings">
              <legend className="sr-only">{t("writingView")}</legend>
              <label htmlFor="font-size">{t("fontSize")} <output>{writing.fontSize}px</output></label>
              <input id="font-size" type="range" min="12" max="64" step="1" value={writing.fontSize} onChange={(event) => onWritingChange("fontSize", Number(event.target.value))} />
              <NumericSetting label={t("fontSize")} value={writing.fontSize} min={12} max={64} step={1} onChange={(value) => onWritingChange("fontSize", value)} />
              <label htmlFor="line-height">{t("lineHeight")} <output>{writing.lineHeight.toFixed(2)}</output></label>
              <input id="line-height" type="range" min="1" max="3.2" step="0.05" value={writing.lineHeight} onChange={(event) => onWritingChange("lineHeight", Number(event.target.value))} />
              <NumericSetting label={t("lineHeight")} value={writing.lineHeight} min={1} max={3.2} step={0.05} onChange={(value) => onWritingChange("lineHeight", value)} />
              <label htmlFor="letter-spacing">{t("letterSpacing")} <output>{writing.letterSpacing.toFixed(2)}em</output></label>
              <input id="letter-spacing" type="range" min="-0.03" max="0.12" step="0.01" value={writing.letterSpacing} onChange={(event) => onWritingChange("letterSpacing", Number(event.target.value))} />
              <label htmlFor="editor-width">{t("editorWidth")} <output>{writing.editorWidth}px</output></label>
              <input id="editor-width" type="range" min="480" max="1000" step="20" value={writing.editorWidth} onChange={(event) => onWritingChange("editorWidth", Number(event.target.value))} />
            </fieldset>
          </details>
        </>
      )}

      <p className="shortcut-help">
        {t("moveShortcut", { alt: isMac ? "⌥" : "Alt", shift: isMac ? "⇧" : "Shift" })}
      </p>
    </aside>
  );
}
