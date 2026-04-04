export { RuntimeLimitError, assertWithinLimits, isPlainObject, joinPath, log, maybeLogProgress, normalizeRtdbPath } from "./email-export-runtime.mjs";

export function canonicalizeForInternalUse(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "")
    .replace(/\.+/g, ".");
}
