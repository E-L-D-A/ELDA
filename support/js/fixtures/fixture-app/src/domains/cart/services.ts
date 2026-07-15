import { openCart } from './cart.use-cases';
import { checkout } from './checkout';
export const cartService = () => { openCart(); checkout(); };
