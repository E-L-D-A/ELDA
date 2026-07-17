import { openCart } from './cart.flows';
import { checkoutService } from './checkout/services';
export const cartService = () => { openCart(); checkoutService(); };
