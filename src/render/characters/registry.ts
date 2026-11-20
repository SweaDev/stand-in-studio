import type { CharacterId } from '../../shared/types';
import type { Character } from './Character';

/** Factory/registry of characters; each character module registers itself. */
const characters = new Map<CharacterId, Character>();

export function registerCharacter(c: Character): void {
  characters.set(c.id, c);
}

export function getCharacter(id: CharacterId): Character | undefined {
  return characters.get(id);
}

/** Registered characters, falling back to the first one for unknown ids. */
export function characterOrDefault(id: CharacterId): Character {
  const c = characters.get(id) ?? characters.values().next().value;
  if (!c) throw new Error('no characters registered');
  return c;
}

export function listCharacters(): Character[] {
  return [...characters.values()];
}
