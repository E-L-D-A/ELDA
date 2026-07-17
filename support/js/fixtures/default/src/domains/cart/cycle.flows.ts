// CHANNEL.5 (Gate 1): this unit and the `orders` unit of the same name close a reference cycle
// through each other's public surfaces.
// Every edge in the cycle is legal read on its own - an equal-rank flow crossing through a
// surface, which is exactly what a surface is for - so no per-file rule can see it, and no file in
// it is at fault. The cycle is a property of the graph, and only the whole-graph pass decides it.
import { orderLabel } from '#/orders';

export const cartLabel = (n: number) => `${orderLabel()} x${n}`;
