import { useEffect, useState } from 'react';
import type { z } from 'astro/zod';
import type { DraftsIndexSchema } from '../lib/articles/schema';
import { spConfig } from '../../sp.config.ts';

type DraftsIndex = z.infer<typeof DraftsIndexSchema>;

/**
 * Renders nothing unless the URL carries `?drafts=true` (param name from spConfig). Then it fetches
 * /drafts-index.json (the only place unlisted URLs exist) and shows the tray. Server HTML is always empty.
 */
export default function DraftDiscovery() {
  const [data, setData] = useState<DraftsIndex | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const on = new URLSearchParams(window.location.search).get(spConfig.features.draftDiscoveryParam) === 'true';
    if (!on) return;
    let live = true;
    fetch('/drafts-index.json')
      .then((r) => (r.ok ? (r.json() as Promise<DraftsIndex>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <aside className="sp-drafts-tray" aria-label="Unlisted drafts and prototypes">
        Could not load the drafts index.
      </aside>
    );
  }
  if (!data) return null;
  return (
    <aside className="sp-drafts-tray" aria-label="Unlisted drafts and prototypes">
      <div className="sp-section-title" style={{ margin: 0 }}>
        Unlisted drafts &amp; prototypes · noindex
      </div>
      <ul>
        {data.drafts.map((d) => (
          <li key={d.url}>
            <strong>Draft · {d.phase}</strong> <a href={d.url}>{d.title}</a> <span className="sp-mono">{d.url}</span>
          </li>
        ))}
        {data.prototypes.map((p) => (
          <li key={p.url}>
            <strong>Prototype v{p.version}{p.latest ? ' (latest)' : ''}</strong> <a href={p.url}>{p.slug}</a>{' '}
            <span className="sp-mono">{p.url}</span>
          </li>
        ))}
        {data.drafts.length + data.prototypes.length === 0 && <li>Nothing unlisted right now.</li>}
      </ul>
    </aside>
  );
}
