import { randomUUID } from 'expo-crypto';

/** A new random UUID, used for swipes and lists so every device agrees on identity. */
export function newId(): string {
  return randomUUID();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
