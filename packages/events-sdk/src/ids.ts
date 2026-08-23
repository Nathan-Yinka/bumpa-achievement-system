import { randomBytes } from 'node:crypto';
import type { EntityIdPrefix } from './enums';

export function createReadableId(prefix: EntityIdPrefix): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}
