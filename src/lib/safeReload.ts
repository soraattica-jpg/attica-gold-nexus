import {
  INTAKE_FORM_CLOSED_EVENT,
  INTAKE_SAVE_FINISHED_EVENT,
  isIntakeFormActive,
  isIntakeSaveInProgress,
} from "@/lib/intakeSave";
import { removeSessionStorageItem, writeSessionStorageItem, readSessionStorageItem } from "@/lib/browserStorage";

const ACTIVE_CALL_IN_PROGRESS_KEY = "attica_active_call_in_progress";
const PENDING_SAFE_RELOAD_KEY = "attica_pending_safe_reload";
const ACTIVE_CALL_FINISHED_EVENT = "attica:active-call-finished";

const getSessionStorage = () => {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
};

export const isActiveCallInProgress = () => {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    return storage.getItem(ACTIVE_CALL_IN_PROGRESS_KEY) === "1";
  } catch (error) {
    console.error("Failed to read active call state:", error);
    return false;
  }
};

export const markActiveCallStarted = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(ACTIVE_CALL_IN_PROGRESS_KEY, "1");
  } catch (error) {
    console.error("Failed to mark active call state:", error);
  }
};

export const markActiveCallFinished = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(ACTIVE_CALL_IN_PROGRESS_KEY);
  } catch (error) {
    console.error("Failed to clear active call state:", error);
  }

  try {
    window.dispatchEvent(new Event(ACTIVE_CALL_FINISHED_EVENT));
  } catch (error) {
    console.error("Failed to dispatch active call completion event:", error);
  }
};

export const deferReloadUntilSafe = () => {
  const storage = getSessionStorage();
  if (!storage) return false;

  if (!isIntakeSaveInProgress() && !isIntakeFormActive() && !isActiveCallInProgress()) {
    return false;
  }

  try {
    storage.setItem(PENDING_SAFE_RELOAD_KEY, "1");
  } catch (error) {
    console.error("Failed to defer reload until safe:", error);
  }

  return true;
};

export const registerDeferredSafeReloadListener = () => {
  if (typeof window === "undefined") return () => undefined;

  const tryReloadIfSafe = () => {
    if (isIntakeSaveInProgress() || isIntakeFormActive() || isActiveCallInProgress()) {
      return;
    }

    const shouldReload = readSessionStorageItem(PENDING_SAFE_RELOAD_KEY) === "1";
    if (!shouldReload) return;

    removeSessionStorageItem(PENDING_SAFE_RELOAD_KEY);
    window.location.reload();
  };

  window.addEventListener(INTAKE_SAVE_FINISHED_EVENT, tryReloadIfSafe);
  window.addEventListener(INTAKE_FORM_CLOSED_EVENT, tryReloadIfSafe);
  window.addEventListener(ACTIVE_CALL_FINISHED_EVENT, tryReloadIfSafe);

  return () => {
    window.removeEventListener(INTAKE_SAVE_FINISHED_EVENT, tryReloadIfSafe);
    window.removeEventListener(INTAKE_FORM_CLOSED_EVENT, tryReloadIfSafe);
    window.removeEventListener(ACTIVE_CALL_FINISHED_EVENT, tryReloadIfSafe);
  };
};

export const clearPendingSafeReload = () => {
  removeSessionStorageItem(PENDING_SAFE_RELOAD_KEY);
};

export const clearActiveCallReloadGuard = () => {
  removeSessionStorageItem(ACTIVE_CALL_IN_PROGRESS_KEY);
};
