import type {Updater} from "@tanstack/vue-table";

import type {Ref} from "vue";

export function valueUpdater<T>(updaterOrValue: Updater<T>, ref: Ref<T>) {
    ref.value = typeof updaterOrValue === "function" ? (updaterOrValue as (old: T) => T)(ref.value) : updaterOrValue;
}
