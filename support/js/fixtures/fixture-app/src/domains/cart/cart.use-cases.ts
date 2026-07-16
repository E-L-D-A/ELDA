import { emptyCart, type Cart } from './cart.entities';
import { clamp } from '@/core/util.entities';
export const openCart = (): Cart => ({ ...emptyCart, total: clamp(0) });
