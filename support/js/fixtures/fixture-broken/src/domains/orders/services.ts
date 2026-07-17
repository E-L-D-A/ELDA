import { placeOrder } from './orders.flows';
export const ordersService = () => placeOrder();

// The print subtree ships to another runtime; its entry composes services alone, so the stale flow is dead bundle weight.
// @elda-import:print/*
// @elda-entry
export const printEntry = './print/services';
