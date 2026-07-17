import { helper } from './other-lateral.services';
import { bind } from './bad-lateral.harnesses';
export const badLateral = () => helper() + bind();
