/**
 * Browser entry point for excalidraw SVG export.
 * Bundled by Bun.build and loaded in a Playwright page.
 */

import { exportToSvg, } from '@excalidraw/excalidraw'
;(globalThis as any).__renderExcalidraw = async (
  json: string,
  darkMode: boolean,
): Promise<string> => {
  const data = JSON.parse(json,)
  const svg = await exportToSvg({
    elements: data.elements || [],
    appState: {
      ...(data.appState || {}),
      exportWithDarkMode: darkMode,
      viewBackgroundColor: darkMode ? '#111111' : '#ffffff',
      theme: darkMode ? 'dark' : 'light',
    },
    files: data.files || {},
  },)
  return new XMLSerializer().serializeToString(svg,)
}
;(globalThis as any).__excalidrawReady = true
