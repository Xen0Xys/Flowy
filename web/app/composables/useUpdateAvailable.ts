import {computed, ref} from "vue";
import {useApi} from "~/composables/useApi";

export type LatestRelease = {
    tag_name: string;
    name: string;
    html_url: string;
    published_at: string;
};

type UpdateStatusResponse = {
    updateAvailable: boolean;
    currentVersion: string;
    latest: {
        tagName: string;
        name: string;
        htmlUrl: string;
        publishedAt: string;
    } | null;
    checkedAt: string | null;
};

const latestRelease = ref<LatestRelease | null>(null);
const currentVersion = ref<string>("");
const checkedAt = ref<string | null>(null);
const checking = ref(false);

export function useUpdateAvailable() {
    const {apiFetch} = useApi();

    async function check(): Promise<void> {
        if (checking.value) return;
        checking.value = true;
        try {
            const data = await apiFetch<UpdateStatusResponse>("/updates");
            currentVersion.value = data.currentVersion;
            checkedAt.value = data.checkedAt;
            latestRelease.value = data.latest
                ? {
                      tag_name: data.latest.tagName,
                      name: data.latest.name,
                      html_url: data.latest.htmlUrl,
                      published_at: data.latest.publishedAt,
                  }
                : null;
        } catch (err) {
            if (import.meta.dev) console.warn("[useUpdateAvailable] /updates failed", err);
        } finally {
            checking.value = false;
        }
    }

    return {
        latestRelease: computed(() => latestRelease.value),
        currentVersion: computed(() => currentVersion.value),
        checkedAt: computed(() => checkedAt.value),
        updateAvailable: computed(() => latestRelease.value !== null),
        checking: computed(() => checking.value),
        check,
    };
}
