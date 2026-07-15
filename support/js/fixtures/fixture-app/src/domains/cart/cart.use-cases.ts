import { emptyCart, type Cart } from './cart.entities';
import { clamp } from '@/core/util';
export const openCart = (): Cart => ({ ...emptyCart, total: clamp(0) });
