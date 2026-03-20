import { writeFileSync, } from 'fs'
import { join, } from 'path'
import type { SiteConfig, } from '../../schemas'

/** Generate PWA manifest.json. */
export function generateManifest(config: SiteConfig, outDir: string,): void {
  const themeColor = config.theme?.darkColor || '#020617'
  const manifest = {
    name: config.title,
    short_name: config.name,
    description: config.description,
    start_url: '/',
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    icons: [
      { src: '/favicons/android-icon-36x36.png', sizes: '36x36', type: 'image/png', },
      { src: '/favicons/android-icon-48x48.png', sizes: '48x48', type: 'image/png', },
      { src: '/favicons/android-icon-72x72.png', sizes: '72x72', type: 'image/png', },
      { src: '/favicons/android-icon-96x96.png', sizes: '96x96', type: 'image/png', },
      { src: '/favicons/android-icon-144x144.png', sizes: '144x144', type: 'image/png', },
      { src: '/favicons/android-icon-192x192.png', sizes: '192x192', type: 'image/png', },
    ],
  }
  writeFileSync(join(outDir, 'manifest.json',), JSON.stringify(manifest, null, 2,),)
}
