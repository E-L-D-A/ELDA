// The entry of an embedded runtime: nothing in the app imports this subtree, and the orders service ships it as source (its `@elda-import:receipt/*` directive).
import { receiptTitle } from './axioms';
export const renderReceipt = () => receiptTitle;
