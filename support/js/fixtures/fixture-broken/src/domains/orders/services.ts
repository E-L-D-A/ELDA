import { placeOrder } from './orders.use-cases';
export const ordersService = () => placeOrder();

// The print subtree ships to another runtime; its entry composes services alone, so the stale use-case is dead bundle weight.
// @elda-import:print/*
// @elda-entry
export const printEntry = './print/services';
