import { emptyCart, type Cart } from './cart.axioms';
import { clamp } from '@/core/util.axioms';
export const openCart = (): Cart => ({ ...emptyCart, total: clamp(0) });
