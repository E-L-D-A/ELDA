import { cartService } from '#/cart/services';
import { ordersService } from '#/orders/services';
export const boot = () => { cartService(); ordersService(); };
