// The other half of the Gate-1 cycle: `cart` reaches this file through the orders barrel, and this
// file reaches back through cart's.
import { cartLabel } from '#/cart';

export const orderLabel = () => 'order';
export const orderSummary = () => cartLabel(1);
