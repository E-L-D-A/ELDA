import { seed, type Order } from './orders.axioms';
import { clamp } from '@/core/util.axioms';
export const placeOrder = (): Order => ({ ...seed, id: clamp(1) });
