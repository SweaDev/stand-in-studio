import { describe, expect, it } from 'vitest';
import { ApiKeyStore } from '../../../src/main/apiKey';

describe('ApiKeyStore', () => {
  it('reads the env key and removes it from the environment', () => {
    const env: NodeJS.ProcessEnv = { PRESAGE_API_KEY: '  abc123  ' };
    const k = new ApiKeyStore(env);
    expect(k.get()).toBe('abc123');
    expect(k.status()).toEqual({ available: true, source: 'env' });
    expect(env.PRESAGE_API_KEY).toBeUndefined();
  });

  it('prefers a pasted key, validates input and can clear it', () => {
    const k = new ApiKeyStore({});
    expect(k.status()).toEqual({ available: false, source: null });
    expect(k.set('has space').available).toBe(false);
    expect(k.set('').available).toBe(false);
    expect(k.set(42).available).toBe(false);
    expect(k.set('x'.repeat(2000)).available).toBe(false);
    expect(k.set('pasted-key')).toEqual({ available: true, source: 'pasted' });
    expect(k.get()).toBe('pasted-key');
    expect(k.clear()).toEqual({ available: false, source: null });
  });

  it('treats an empty env var as no key', () => {
    expect(new ApiKeyStore({ PRESAGE_API_KEY: '' }).status().available).toBe(false);
  });
});
