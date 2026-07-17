import { placeOrder } from './orders.use-cases';
export const ordersService = () => placeOrder();

// The receipt subtree ships to another runtime as source; nothing imports it, and the directive carries the reach.
// @elda-import:receipt/*
// @elda-entry
export const receiptEntry = './receipt/services';
