import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/**
 * Local-only tier (§3, P2): `/visuals-export/[slug]/` exists only in `astro dev` started by
 * `scripts/render-visuals.mjs` (SP_VISUALS_RENDER=1). `astro build` never registers it, so it cannot reach dist/.
 */
export default function visualsRoute(): AstroIntegration {
  return {
    name: 'sp-visuals-route',
    hooks: {
      'astro:config:setup': ({ config, command, injectRoute }) => {
        if (command !== 'dev' || process.env.SP_VISUALS_RENDER !== '1') return;
        const entrypoint = 'src/internal-routes/visuals-export.astro';
        if (!fs.existsSync(path.join(fileURLToPath(config.root), entrypoint))) {
          throw new Error(`[sp-visuals-route] SP_VISUALS_RENDER=1 but ${entrypoint} is missing`);
        }
        injectRoute({ pattern: '/visuals-export/[slug]', entrypoint, prerender: true });
      },
    },
  };
}
