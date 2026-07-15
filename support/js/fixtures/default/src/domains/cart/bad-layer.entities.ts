// elda/imports (LAYER.1): an inner layer reaching an outer one.
import { withVat } from './pricing.use-cases';

export const bad = withVat(1);
