import { CART_KEY } from '../axioms';
import { BACK } from './back-nav.axioms';

// A unit directory is transparent, so this file is a unit of `cart` and reads cart's shared base like any other unit.
export const backKey = () => BACK + CART_KEY;
