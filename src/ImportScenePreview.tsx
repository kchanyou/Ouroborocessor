import { memo, useEffect, useState } from "react";
import type { Locale } from "./i18n";
import type { ImportedScene } from "./importManuscript";
import { importPreviewPage } from "./importPreview";
import { writingToolsText } from "./writingToolsText";

export const ImportScenePreview = memo(function ImportScenePreview({ scene, locale }: { scene: ImportedScene; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [scene.content]);
  const preview = importPreviewPage(scene.content, page);
  const t = writingToolsText[locale];
  return <li>
    <details onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><strong>{scene.title}</strong></summary>
      {expanded && <>
        <pre key={preview.index}>{preview.text}</pre>
        {preview.pages > 1 && <div className="import-preview-pages">
          <button type="button" disabled={preview.index === 0} onClick={() => setPage(preview.index - 1)}>{t.previewPrevious}</button>
          <span role="status" aria-live="polite">{t.previewPage.replace("{page}", (preview.index + 1).toLocaleString(locale)).replace("{pages}", preview.pages.toLocaleString(locale))}</span>
          <button type="button" disabled={preview.index === preview.pages - 1} onClick={() => setPage(preview.index + 1)}>{t.previewNext}</button>
        </div>}
      </>}
    </details>
  </li>;
});
