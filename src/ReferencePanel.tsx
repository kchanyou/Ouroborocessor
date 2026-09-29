import type { Locale } from "./i18n";
import type { ProjectSnapshot, ResourceCard } from "./types";
import { ResourcePanel } from "./ResourcePanel";
import { resourceText } from "./resourceI18n";
import { ResourceBacklinksPanel } from "./ResourceBacklinksPanel";
import type { ProjectMatch } from "./projectSearch";

export function ReferencePanel({ project, locale, card, onOpenCard, onNavigate }: {
  project: ProjectSnapshot; locale: Locale; card: ResourceCard | null;
  onOpenCard: (card: ResourceCard) => void; onNavigate?: (hit: ProjectMatch) => Promise<void>;
}) {
  const t = resourceText[locale];
  return <main role="tabpanel" className="reference-panel has-resources" aria-label={card?.name ?? t.title}>
    {card ? <article className="resource-panel reference-card" tabIndex={0}>
      <p className="reference-card-kind">{t[card.kind]}</p>
      <h1>{card.name}</h1>
      <p className="resource-description">{card.description}</p>
      <dl><dt>{t.aliases}</dt><dd>{card.aliases.join(" · ")}</dd><dt>{t.tags}</dt><dd>{card.tags.join(" · ")}</dd></dl>
      {onNavigate && <ResourceBacklinksPanel key={card.id} projectPath={project.projectPath} nodes={project.nodes} resourceId={card.id} locale={locale} onNavigate={onNavigate} />}
    </article> : <ResourcePanel key={project.projectPath} projectPath={project.projectPath} locale={locale} nodes={project.nodes} onNavigate={onNavigate} onOpenCard={onOpenCard} />}
  </main>;
}
