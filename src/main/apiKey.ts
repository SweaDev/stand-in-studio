import type { ApiKeyStatus } from '../shared/ipc';

const MAX_KEY = 1024;

/**
 * Holds the Presage API key in the main process only (REQUIREMENT §6): read from the
 * PRESAGE_API_KEY environment variable or pasted in the UI. Never written to disk and never
 * sent to a renderer.
 */
export class ApiKeyStore {
  private envKey: string | null;
  private pastedKey: string | null = null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const k = env.PRESAGE_API_KEY?.trim();
    this.envKey = k ? k : null;
    // Keep the key out of any child process environment.
    delete env.PRESAGE_API_KEY;
  }

  get(): string | null {
    return this.pastedKey ?? this.envKey;
  }

  status(): ApiKeyStatus {
    if (this.pastedKey) return { available: true, source: 'pasted' };
    if (this.envKey) return { available: true, source: 'env' };
    return { available: false, source: null };
  }

  /** Accepts a pasted key (kept in memory until quit). Invalid input is ignored. */
  set(key: unknown): ApiKeyStatus {
    if (typeof key === 'string') {
      const k = key.trim();
      if (k.length > 0 && k.length <= MAX_KEY && !/\s/.test(k)) this.pastedKey = k;
    }
    return this.status();
  }

  clear(): ApiKeyStatus {
    this.pastedKey = null;
    return this.status();
  }
}
