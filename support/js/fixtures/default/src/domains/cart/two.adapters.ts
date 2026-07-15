// elda/no-adapter-coupling (OWNER.5): one adapters unit reaching another.
import { one } from './one.adapters';

export const two = () => one() + 1;
