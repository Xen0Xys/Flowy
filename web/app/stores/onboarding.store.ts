import {ref} from "vue";
import {defineStore} from "pinia";

export type OnboardingMode = "create" | "join" | null;

const STORAGE_KEY = "flowy:onboarding";

type PersistedState = {
    mode: OnboardingMode;
};

function readPersistedState(): PersistedState {
    if (typeof window === "undefined") return {mode: null};
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return {mode: null};
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        return {mode: parsed?.mode ?? null};
    } catch {
        return {mode: null};
    }
}

function writePersistedState(state: PersistedState) {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore quota / privacy errors
    }
}

export const useOnboardingStore = defineStore("onboarding", () => {
    const mode = ref<OnboardingMode>(null);

    function hydrate() {
        const persisted = readPersistedState();
        mode.value = persisted.mode;
    }

    function setMode(next: OnboardingMode) {
        mode.value = next;
        writePersistedState({mode: next});
    }

    function reset() {
        mode.value = null;
        writePersistedState({mode: null});
    }

    return {mode, hydrate, setMode, reset};
});
