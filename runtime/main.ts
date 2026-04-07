/**
 * Runtime entry point — browser only.
 *
 * All features are progressive enhancements on top of CSS-only behavior.
 * The site works without JS — this adds localStorage persistence,
 * keyboard shortcuts, TOC highlighting, and sidebar scroll-to-current.
 */

import { initCopyCode } from "./copy-code";
import { initSidebar } from "./sidebar";
import { initTheme } from "./theme";
import { initTocHighlight } from "./toc-highlight";

initTheme();
initSidebar();
initTocHighlight();
initCopyCode();
