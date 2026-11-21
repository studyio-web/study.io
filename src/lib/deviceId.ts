import { Preferences } from '@capacitor/preferences';

/**
 * Authoritative Device Identifier Generator & Persistence Layer
 *
 * Guarantees:
 * 1. Generated ONCE per device / installation and never regenerated unless storage is wiped.
 * 2. Persisted in Capacitor Preferences (native Android/iOS) and localStorage (web).
 * 3. Survives Android WebView recreation, activity restarts, backgrounding, and navigation.
 * 4. Strips any suffix tags (#countdown, #ultra, #sess) so device comparison is 100% deterministic.
 */

const STORAGE_KEY = 'studyio_device_id';
const LEGACY_STORAGE_KEY = 'studypulse_tab_device_id';

let memoryCachedDeviceId: string | null = null;
let isInitialized = false;

/**
 * Synchronous device ID getter.
 * Returns the cached memory / localStorage ID immediately.
 */
export function getDeviceId(): string {
  if (memoryCachedDeviceId) {
    return memoryCachedDeviceId;
  }

  if (typeof window === 'undefined') {
    return 'server-side';
  }

  try {
    // 0. Check Android native injected ID or native JavaScript bridge synchronously
    const nativeInjected = (window as any).__STUDYIO_NATIVE_DEVICE_ID__;
    if (nativeInjected && typeof nativeInjected === 'string' && nativeInjected.trim().length > 0) {
      memoryCachedDeviceId = nativeInjected.trim();
      try {
        localStorage.setItem(STORAGE_KEY, memoryCachedDeviceId);
      } catch {}
      return memoryCachedDeviceId;
    }

    const bridgeMethod = (window as any).AndroidFullscreenBridge?.getNativeDeviceId;
    if (typeof bridgeMethod === 'function') {
      try {
        const nativeBridgeId = bridgeMethod();
        if (nativeBridgeId && typeof nativeBridgeId === 'string' && nativeBridgeId.trim().length > 0) {
          memoryCachedDeviceId = nativeBridgeId.trim();
          try {
            localStorage.setItem(STORAGE_KEY, memoryCachedDeviceId);
          } catch {}
          return memoryCachedDeviceId;
        }
      } catch {}
    }

    // 1. Check primary localStorage
    let id = localStorage.getItem(STORAGE_KEY);

    // 2. Fallback to legacy keys if present
    if (!id) {
      id = localStorage.getItem(LEGACY_STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(LEGACY_STORAGE_KEY);
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      }
    }

    // 3. Generate only if storage is truly empty
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      localStorage.setItem(STORAGE_KEY, id);
      try {
        sessionStorage.setItem(STORAGE_KEY, id);
      } catch {}

      // Asynchronously persist to Capacitor Preferences if available
      try {
        Preferences.set({ key: STORAGE_KEY, value: id }).catch(() => {});
      } catch {}
    }

    memoryCachedDeviceId = id;
    return id;
  } catch {
    return memoryCachedDeviceId || 'fallback-device-id';
  }
}

/**
 * Initializes device ID from Capacitor Preferences (native storage)
 * Call this on app bootstrap to ensure device_id is hydrated from native storage
 * before any timer actions or pull-syncs occur.
 */
export async function initDeviceId(): Promise<string> {
  // If native bridge already provided it synchronously, we are already initialized
  const nativeBridgeId = typeof window !== 'undefined'
    ? ((window as any).__STUDYIO_NATIVE_DEVICE_ID__ || (window as any).AndroidFullscreenBridge?.getNativeDeviceId?.())
    : null;
  if (nativeBridgeId && typeof nativeBridgeId === 'string' && nativeBridgeId.trim().length > 0) {
    memoryCachedDeviceId = nativeBridgeId.trim();
    isInitialized = true;
    try {
      localStorage.setItem(STORAGE_KEY, memoryCachedDeviceId);
    } catch {}
    return memoryCachedDeviceId;
  }

  if (isInitialized && memoryCachedDeviceId) {
    return memoryCachedDeviceId;
  }

  try {
    // Attempt reading from native Capacitor Preferences first
    const { value: nativeId } = await Preferences.get({ key: STORAGE_KEY });

    if (nativeId && nativeId.trim().length > 0) {
      memoryCachedDeviceId = nativeId.trim();
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, memoryCachedDeviceId);
        } catch {}
      }
      isInitialized = true;
      return memoryCachedDeviceId;
    }

    // If native preferences is empty, check localStorage
    let localId: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        localId = localStorage.getItem(STORAGE_KEY);
      } catch {}
    }

    if (!localId) {
      localId = getDeviceId();
    } else {
      memoryCachedDeviceId = localId;
    }

    await Preferences.set({ key: STORAGE_KEY, value: localId }).catch(() => {});
    isInitialized = true;
    return localId;
  } catch {
    isInitialized = true;
    return getDeviceId();
  }
}

/**
 * Strips any appended hash fragments (#countdown, #ultra, #sess:uuid)
 * from device_id string to yield pure base device ID.
 */
export function cleanDeviceId(rawDeviceId?: string | null): string {
  if (!rawDeviceId) return '';
  return String(rawDeviceId).split('#')[0].trim();
}

/**
 * Test helper to reset or set device ID
 */
export function setDeviceIdForTesting(id: string | null): void {
  memoryCachedDeviceId = id;
  isInitialized = Boolean(id);
  if (typeof window !== 'undefined') {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }
}

export function resetDeviceIdForTesting(): void {
  memoryCachedDeviceId = null;
  isInitialized = false;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
  }
}
