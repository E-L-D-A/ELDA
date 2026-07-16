import { readStore } from './store.adapters';
import { LIMIT } from './rules.entities';

export const persist = (): string => readStore().slice(0, LIMIT);
