import { helper } from './other-lateral.services';
import { bind } from './bad-lateral.adapters';
export const badLateral = () => helper() + bind();
