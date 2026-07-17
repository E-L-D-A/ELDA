// elda/no-harness-coupling (OWNER.5): one harnesses unit reaching another.
import { one } from './one.harnesses';

export const two = () => one() + 1;
