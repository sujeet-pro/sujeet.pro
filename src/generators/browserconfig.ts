import { writeFileSync, } from 'fs'
import { join, } from 'path'
import type { SiteConfig, } from '../../schemas'

/** Generate browserconfig.xml for MS tile configuration. */
export function generateBrowserconfig(config: SiteConfig, outDir: string,): void {
  const tileColor = config.theme?.darkColor || '#020617'
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square70x70logo src="/favicons/ms-icon-70x70.png"/>
      <square150x150logo src="/favicons/ms-icon-150x150.png"/>
      <square310x310logo src="/favicons/ms-icon-310x310.png"/>
      <TileColor>${tileColor}</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`
  writeFileSync(join(outDir, 'browserconfig.xml',), xml,)
}
