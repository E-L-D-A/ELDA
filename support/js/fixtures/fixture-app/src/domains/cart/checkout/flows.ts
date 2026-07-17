import { blank, type Receipt } from './axioms';
export const checkout = (): Receipt => ({ ...blank, paid: true });
