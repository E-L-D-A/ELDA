import { readStore } from './store.adapters';
import { LIMIT } from './rules.entities';

export const report = (): string => `report: ${readStore()}`.slice(0, LIMIT);
