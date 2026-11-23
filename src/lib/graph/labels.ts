/** Display labels shared by the article header, ArticleRef cards and the Connections panel. */
export const ARCHETYPE_LABEL: Record<string, string> = {
  standard: 'Article',
  'design-x': 'System design',
  'business-story': 'Business story',
  'building-block': 'Building block',
};

export const RELATION_LABEL: Record<string, string> = {
  prerequisite: 'Prerequisite',
  'builds-on': 'Builds on',
  'deep-dive-of': 'Deep dive of',
  'uses-building-block': 'Building block',
  related: 'Related',
};

export const archetypeLabel = (a: string): string => ARCHETYPE_LABEL[a] ?? a;
export const relationLabel = (k: string): string => RELATION_LABEL[k] ?? k;
