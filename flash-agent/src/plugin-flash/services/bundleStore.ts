import type { ExecutionBundle } from "../types/index.js";

const bundles: ExecutionBundle[] = [];
const MAX_BUNDLES = 200;

export function saveBundle(bundle: ExecutionBundle): void {
  const idx = bundles.findIndex((b) => b.bundleId === bundle.bundleId);
  if (idx >= 0) {
    bundles[idx] = bundle;
  } else {
    bundles.unshift(bundle);
    if (bundles.length > MAX_BUNDLES) {
      bundles.pop();
    }
  }
}

export function getBundles(limit = 25): ExecutionBundle[] {
  return bundles.slice(0, Math.max(1, limit));
}

export function getBundle(bundleId: string): ExecutionBundle | undefined {
  return bundles.find((b) => b.bundleId === bundleId);
}
