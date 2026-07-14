// elda/no-service-coupling (OWNER.5): one services unit reaching another.
import { left } from './left.services';

export const right = () => left();
