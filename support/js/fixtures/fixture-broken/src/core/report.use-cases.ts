import { readStore } from './store.adapters';

export const report = (): string => `report: ${readStore()}`;
