import { VAT } from './pricing.entities';

export const withVat = (n: number) => n * (1 + VAT);
