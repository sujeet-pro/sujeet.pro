import { useSyncExternalStore } from 'react';

// Page-level lab state shared across islands (level picker ↔ topology ↔ cost calculator).
// Islands import this module from one shared chunk, so they see the same instance.
export type Cloud = 'generic' | 'aws';
export interface LabState {
  /** null until a user picks a level; consumers fall back to their `defaultLevel` prop. */
  level: number | null;
  cloud: Cloud;
}

const SERVER: LabState = { level: null, cloud: 'aws' };
let state: LabState = SERVER;
const listeners = new Set<() => void>();

function emit(next: LabState) {
  state = next;
  for (const l of listeners) l();
}

export const setLabLevel = (level: number) => {
  if (state.level !== level) emit({ ...state, level });
};
export const setLabCloud = (cloud: Cloud) => {
  if (state.cloud !== cloud) emit({ ...state, cloud });
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useLabState(): LabState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
