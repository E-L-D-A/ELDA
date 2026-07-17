import { VAT } from './pricing.axioms';

export const withVat = (n: number) => n * (1 + VAT);
