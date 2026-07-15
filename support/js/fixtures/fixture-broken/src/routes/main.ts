import { cartService } from '#/cart/services';
import { ordersService } from '#/orders/services';
import { note } from '#/cart/summary';
export const boot = () => { cartService(); ordersService(); return note; };
