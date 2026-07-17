// A domain directory is never a unit directory: this is the `cart` unit OF the domain `cart`,
// redundant to read and perfectly classifiable. Collapsing it would leave the file with no chain,
// and a file no rule can place is a file no rule enforces.
import { CART_KEY } from './axioms';

export const cartName = () => CART_KEY;
