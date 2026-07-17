import { readStore } from './store.harnesses';
import { LIMIT } from './rules.axioms';

export const report = (): string => `report: ${readStore()}`.slice(0, LIMIT);
