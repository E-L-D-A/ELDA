import { readStore } from './store.adapters';

export const persist = (): string => readStore();
