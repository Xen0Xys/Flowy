<script lang="ts" setup>
import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";

defineProps<{
    title: string;
    subtitle?: string;
    icon?: string;
    loading?: boolean;
    empty?: boolean;
    emptyMessage?: string;
    emptyAction?: {label: string; onClick: () => void};
}>();
</script>

<template>
    <section
        class="bg-card text-card-foreground border-border/60 relative flex flex-col overflow-hidden rounded-2xl border p-6 shadow-sm">
        <div
            aria-hidden="true"
            class="bg-brand-gradient-soft pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full opacity-40 blur-3xl"></div>

        <header class="relative flex items-start justify-between gap-3 pb-4">
            <div class="flex min-w-0 items-start gap-3">
                <div
                    v-if="icon"
                    class="bg-brand-gradient-soft border-border/60 flex size-9 shrink-0 items-center justify-center rounded-lg border">
                    <Icon :name="icon" class="text-primary size-4" />
                </div>
                <div class="min-w-0">
                    <h3 class="font-heading truncate text-base font-semibold tracking-tight">{{ title }}</h3>
                    <p v-if="subtitle" class="text-muted-foreground mt-0.5 truncate text-xs">{{ subtitle }}</p>
                </div>
            </div>
            <slot name="actions" />
        </header>

        <div class="relative min-h-0 flex-1">
            <div v-if="loading">
                <slot name="skeleton">
                    <div class="flex flex-col gap-3">
                        <Skeleton class="h-4 w-32" />
                        <Skeleton class="h-40 w-full" />
                        <div class="flex gap-3">
                            <Skeleton class="h-3 w-24" />
                            <Skeleton class="h-3 w-16" />
                        </div>
                    </div>
                </slot>
            </div>
            <div v-else-if="empty" class="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Icon class="text-muted-foreground size-8" name="iconoir:journal-page" />
                <p class="text-muted-foreground text-sm">
                    {{ emptyMessage || $t("reports.emptyGeneric") }}
                </p>
                <Button v-if="emptyAction" size="sm" variant="outline" @click="emptyAction.onClick">
                    {{ emptyAction.label }}
                </Button>
            </div>
            <slot v-else />
        </div>
    </section>
</template>
