<script setup lang="ts">
import {ExternalLinkIcon, SparklesIcon} from "@lucide/vue";
import {computed, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {ScrollArea} from "~/components/ui/scroll-area";
import {useWhatsNew} from "~/composables/useWhatsNew";

const {t, locale} = useI18n();
const {open, releases, currentVersion, markAsSeen} = useWhatsNew();

const dateFormatter = computed(
    () =>
        new Intl.DateTimeFormat(locale.value, {
            year: "numeric",
            month: "long",
            day: "numeric",
        }),
);

function formatDate(iso: string): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return dateFormatter.value.format(date);
}

function onImgError(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (target?.tagName === "IMG") target.remove();
}

async function fireConfetti(): Promise<void> {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    try {
        const {default: confetti} = await import("canvas-confetti");
        const base = {
            particleCount: 90,
            spread: 70,
            startVelocity: 45,
            colors: ["#3b6cff", "#8ab4ff", "#ffffff", "#c9d8ff"],
            zIndex: 100,
            disableForReducedMotion: true,
        } as const;
        confetti({...base, origin: {x: 0.2, y: 0.4}, angle: 60});
        confetti({...base, origin: {x: 0.8, y: 0.4}, angle: 120});
    } catch {
        return;
    }
}

watch(
    open,
    (v) => {
        if (v) void fireConfetti();
    },
    {immediate: true},
);
</script>

<template>
    <Dialog :open="open" @update:open="(v) => !v && markAsSeen()">
        <DialogContent
            class="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl [grid-template-rows:auto_minmax(0,1fr)_auto] gap-0 overflow-hidden sm:max-h-[85dvh] sm:max-w-4xl md:max-h-[80dvh]">
            <DialogHeader class="mb-4 shrink-0">
                <div class="flex items-center gap-2">
                    <SparklesIcon class="text-primary h-5 w-5" />
                    <DialogTitle>
                        {{ t("whatsNew.title", {version: currentVersion}) }}
                    </DialogTitle>
                </div>
                <DialogDescription>
                    {{ t("whatsNew.subtitle") }}
                </DialogDescription>
            </DialogHeader>

            <ScrollArea class="min-h-0 overflow-hidden">
                <div class="flex flex-col gap-6 pr-4" @error.capture="onImgError">
                    <article v-for="release in releases" :key="release.tag_name" class="flex flex-col gap-2">
                        <header class="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 class="text-lg font-semibold">
                                {{ release.name || release.tag_name }}
                            </h3>
                            <span class="text-muted-foreground text-xs">
                                {{ formatDate(release.published_at) }}
                            </span>
                        </header>
                        <div
                            v-if="release.body_html_safe"
                            class="whats-new-body text-sm leading-relaxed"
                            v-html="release.body_html_safe"></div>
                        <p v-else-if="release.body" class="text-sm whitespace-pre-wrap">
                            {{ release.body }}
                        </p>
                        <p v-else class="text-muted-foreground text-sm italic">
                            {{ t("whatsNew.noBody") }}
                        </p>
                        <a
                            :href="release.html_url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-primary inline-flex items-center gap-1 self-start text-xs hover:underline">
                            {{ t("whatsNew.viewOnGithub") }}
                            <ExternalLinkIcon class="h-3 w-3" />
                        </a>
                    </article>
                </div>
            </ScrollArea>

            <DialogFooter class="mt-4 shrink-0">
                <Button @click="markAsSeen">{{ t("whatsNew.dismiss") }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<style scoped>
.whats-new-body :deep(h1),
.whats-new-body :deep(h2),
.whats-new-body :deep(h3),
.whats-new-body :deep(h4) {
    font-weight: 600;
    margin-top: 0.75rem;
    margin-bottom: 0.25rem;
}
.whats-new-body :deep(h1) {
    font-size: 1.125rem;
}
.whats-new-body :deep(h2) {
    font-size: 1rem;
}
.whats-new-body :deep(h3),
.whats-new-body :deep(h4) {
    font-size: 0.9375rem;
}
.whats-new-body :deep(p) {
    margin-block: 0.375rem;
}
.whats-new-body :deep(ul),
.whats-new-body :deep(ol) {
    padding-left: 1.25rem;
    margin-block: 0.375rem;
}
.whats-new-body :deep(ul) {
    list-style: disc;
}
.whats-new-body :deep(ol) {
    list-style: decimal;
}
.whats-new-body :deep(li) {
    margin-block: 0.125rem;
}
.whats-new-body :deep(a) {
    color: var(--color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
}
.whats-new-body :deep(code) {
    background: var(--color-muted);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
}
.whats-new-body :deep(pre) {
    background: var(--color-muted);
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.8125rem;
    margin-block: 0.5rem;
}
.whats-new-body :deep(pre code) {
    background: transparent;
    padding: 0;
}
.whats-new-body :deep(blockquote) {
    border-left: 3px solid var(--color-border);
    padding-left: 0.75rem;
    color: var(--color-muted-foreground);
    margin-block: 0.5rem;
}
.whats-new-body :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin-block: 0.75rem;
}
.whats-new-body :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    max-height: 16rem;
    object-fit: contain;
    border-radius: 0.375rem;
    margin: 0.5rem 0;
}
@media (min-width: 640px) {
    .whats-new-body :deep(img) {
        max-height: 20rem;
    }
}
</style>
