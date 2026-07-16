import { seed, type Order } from './orders.entities';
import { clamp } from '@/core/util.entities';
export const placeOrder = (): Order => ({ ...seed, id: clamp(1) });
