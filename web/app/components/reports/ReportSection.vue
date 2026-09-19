<script lang="ts" setup>
defineProps<{
    title: string;
    subtitle?: string;
    icon?: string;
}>();
</script>

<template>
    <section class="flex flex-col gap-3">
        <header class="flex items-center gap-3">
            <div
                v-if="icon"
                class="bg-brand-gradient-soft border-border/60 flex size-9 shrink-0 items-center justify-center rounded-lg border">
                <Icon :name="icon" class="text-primary size-4" />
            </div>
            <div class="min-w-0">
                <h2 class="font-heading truncate text-lg font-semibold tracking-tight">{{ title }}</h2>
                <p v-if="subtitle" class="text-muted-foreground truncate text-xs">{{ subtitle }}</p>
            </div>
        </header>
        <slot />
    </section>
</template>
