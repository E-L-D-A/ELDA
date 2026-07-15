import { blank, type Receipt } from './entities';
export const checkout = (): Receipt => ({ ...blank, paid: true });
