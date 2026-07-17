// elda/no-surface-declarations (SURFACE.2 / OWNER.2): a binding declared on a surface holds no rank.
// elda/no-penetration (SURFACE.1): `export *` is not a deliberate named contract.
export * from './flows';
export { orderLabel } from './cycle.flows';

export const declaredHere = () => 'no owner';
