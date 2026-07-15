import { openCart } from './cart.use-cases';
import { checkoutService } from './checkout/services';
export const cartService = () => { openCart(); checkoutService(); };
