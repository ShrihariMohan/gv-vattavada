export const SW_DISABLED_KEY = "vbm-sw-disabled";
export const SW_SCRIPT = "/sw.js";

export function isServiceWorkerDisabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SW_DISABLED_KEY) === "1";
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (isServiceWorkerDisabled()) return null;
  const reg = await navigator.serviceWorker.register(SW_SCRIPT);
  type SyncReg = ServiceWorkerRegistration & {
    sync?: { register: (tag: string) => Promise<void> };
    periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
  };
  const syncReg = reg as SyncReg;
  try {
    await syncReg.sync?.register("vbm-sync");
  } catch {
    /* Background Sync is optional; the in-app timer still flushes the queue. */
  }
  try {
    await syncReg.periodicSync?.register("vbm-sync", { minInterval: 15 * 60 * 1000 });
  } catch {
    /* Periodic Sync requires a permission and is not available in all browsers. */
  }
  return reg;
}

export async function unregisterAppServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  localStorage.setItem(SW_DISABLED_KEY, "1");
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    reg.active?.postMessage({ type: "CLEAR_CACHES" });
    await reg.unregister();
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export async function reregisterAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  localStorage.removeItem(SW_DISABLED_KEY);
  return registerAppServiceWorker();
}

export async function serviceWorkerStatus(): Promise<{ registered: boolean; disabled: boolean }> {
  const disabled = isServiceWorkerDisabled();
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { registered: false, disabled };
  }
  const regs = await navigator.serviceWorker.getRegistrations();
  return { registered: regs.length > 0, disabled };
}
