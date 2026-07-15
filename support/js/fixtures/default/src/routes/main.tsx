// elda/imports (ROOT.1): a root taking a binding that lands off the services row.
// elda/vocab-gate (OWNER.2 / ROOT.2): a literal-keyed shared-namespace write at the integration surface.
import { cartKey } from '#/cart';
import { mountCart } from '#/cart/services';

export function main() {
  localStorage.setItem('theme', 'dark');
  mountCart();
  return cartKey();
}
