import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { Manager } from './manager.js';

const runtimeCache = new Map();

async function readCatalog() {
  return JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));
}

export function getSkillRuntime(rawHome) {
  const home = resolve(rawHome?.trim() || process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'));
  let existing = runtimeCache.get(home);
  if (existing) return existing;

  const runtimePromise = (async () => {
    const catalog = await readCatalog();
    const listeners = new Set();
    const invalidateSkills = () => {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // Listeners must not block catalog invalidation propagation
        }
      }
    };

    const manager = new Manager({
      catalog,
      home,
      invalidateSkills,
    });

    await manager.recover().catch(() => {});
    await manager.cleanupLegacyGlobalMounts().catch(() => {});

    return {
      manager,
      catalog,
      home,
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  })().catch(error => {
    runtimeCache.delete(home);
    throw error;
  });

  runtimeCache.set(home, runtimePromise);
  return runtimePromise;
}

export function clearSkillRuntimeCacheForTest() {
  runtimeCache.clear();
}
