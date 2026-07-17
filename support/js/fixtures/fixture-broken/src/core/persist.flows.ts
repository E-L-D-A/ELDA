import { readStore } from './store.harnesses';
import { LIMIT } from './rules.axioms';

export const persist = (): string => readStore().slice(0, LIMIT);
