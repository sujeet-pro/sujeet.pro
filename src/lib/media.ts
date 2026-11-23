// Client-safe media URL helper (no node:* imports) — shared by islands and the article-assets integration.
import { spConfig } from '../../sp.config.ts';

/** URL for an article asset, honouring media/audio base URLs. `relPath` is relative to `/<slug>/`. */
export function mediaUrl(slug: string, relPath: string): string {
  const rel = relPath.replace(/^\/+/, '');
  const base: string = rel.startsWith('audio/') ? spConfig.audio.baseUrl : spConfig.media.baseUrl;
  const prefix = base ? base.replace(/\/+$/, '') : '';
  return `${prefix}/${slug}/${rel}`;
}
