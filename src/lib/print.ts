/**
 * Print/PDF render context (Stage 4.4). `src/internal-routes/print-export.astro` marks the request before
 * any component renders; components that hydrate on screen (ExplainerFigure) check it and emit static
 * markup only. Astro.locals is per request, so the flag never leaks into regular pages.
 */
const KEY = 'spPrint';

export const markPrint = (locals: object): void => {
  (locals as Record<string, unknown>)[KEY] = true;
};

export const isPrint = (locals: object): boolean => (locals as Record<string, unknown>)[KEY] === true;
