const INTAKE_SAVE_IN_PROGRESS_KEY = "attica_intake_save_in_progress";
const INTAKE_FORM_ACTIVE_KEY = "attica_intake_form_active";
const PENDING_RELOAD_AFTER_SAVE_KEY = "attica_intake_save_pending_reload";
export const INTAKE_SAVE_FINISHED_EVENT = "attica:intake-save-finished";
export const INTAKE_FORM_CLOSED_EVENT = "attica:intake-form-closed";

const getSessionStorage = () => {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
};

export const markIntakeSaveStarted = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(INTAKE_SAVE_IN_PROGRESS_KEY, "1");
  } catch (error) {
    console.error("Failed to mark intake save as started:", error);
  }
};

export const markIntakeSaveFinished = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(INTAKE_SAVE_IN_PROGRESS_KEY);
  } catch (error) {
    console.error("Failed to clear intake save state:", error);
  }

  try {
    window.dispatchEvent(new Event(INTAKE_SAVE_FINISHED_EVENT));
  } catch (error) {
    console.error("Failed to dispatch intake save completion event:", error);
  }
};

export const isIntakeSaveInProgress = () => {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    return storage.getItem(INTAKE_SAVE_IN_PROGRESS_KEY) === "1";
  } catch (error) {
    console.error("Failed to read intake save state:", error);
    return false;
  }
};

export const markIntakeFormActive = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(INTAKE_FORM_ACTIVE_KEY, "1");
  } catch (error) {
    console.error("Failed to mark intake form as active:", error);
  }
};

export const markIntakeFormInactive = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(INTAKE_FORM_ACTIVE_KEY);
  } catch (error) {
    console.error("Failed to clear intake form active state:", error);
  }

  try {
    window.dispatchEvent(new Event(INTAKE_FORM_CLOSED_EVENT));
  } catch (error) {
    console.error("Failed to dispatch intake form closed event:", error);
  }
};

export const isIntakeFormActive = () => {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    return storage.getItem(INTAKE_FORM_ACTIVE_KEY) === "1";
  } catch (error) {
    console.error("Failed to read intake form active state:", error);
    return false;
  }
};

export const deferReloadUntilAfterIntakeSave = () => {
  const storage = getSessionStorage();
  if (!storage) return false;

  if (!isIntakeSaveInProgress()) {
    return false;
  }

  try {
    storage.setItem(PENDING_RELOAD_AFTER_SAVE_KEY, "1");
  } catch (error) {
    console.error("Failed to defer reload during intake save:", error);
  }

  return true;
};

export const registerDeferredReloadListener = () => {
  if (typeof window === "undefined") return () => undefined;

  const handleSaveFinished = () => {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
      if (storage.getItem(PENDING_RELOAD_AFTER_SAVE_KEY) !== "1") {
        return;
      }
      storage.removeItem(PENDING_RELOAD_AFTER_SAVE_KEY);
    } catch (error) {
      console.error("Failed to consume deferred reload flag:", error);
      return;
    }
  };

  window.addEventListener(INTAKE_SAVE_FINISHED_EVENT, handleSaveFinished);
  return () => {
    window.removeEventListener(INTAKE_SAVE_FINISHED_EVENT, handleSaveFinished);
  };
};
