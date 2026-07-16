import { cartService } from '#/cart/services';
import { ordersService } from '#/orders/services';
import { note } from '#/cart/summary';
import { bootCart } from '../domains/cart/boot.services';
export const boot = () => { bootCart(); cartService(); ordersService(); return note; };
