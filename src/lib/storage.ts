export const STORAGE_KEY = "nec_app_state_v2_0";

export function loadState<T>(defaultValue: T): T {
  if (typeof window === "undefined") {
    return defaultValue;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultValue;
    }

    const parsed = JSON.parse(raw) as T;
    return { ...defaultValue, ...parsed };
  } catch (error) {
    console.warn("Failed to parse stored state", error);
    return defaultValue;
  }
}

export function saveState<T>(value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Failed to persist state", error);
  }
}
