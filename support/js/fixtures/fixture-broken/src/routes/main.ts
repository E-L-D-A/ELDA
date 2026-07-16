import { cartService } from '#/cart/services';
import { ordersService } from '#/orders/services';
import { note } from '#/cart/summary';
import { bootCart } from '../domains/cart/boot.services';
import { persist } from '../core/persist.use-cases';
export const boot = () => { bootCart(); persist(); cartService(); ordersService(); return note; };
