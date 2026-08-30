<script lang="ts" setup>
import {cn} from "~/lib/utils";

const props = defineProps<{
    result: {insertedCount: number; duplicatesInDb: number} | null;
}>();

const emit = defineEmits<{
    (e: "reset"): void;
    (e: "done"): void;
}>();

const {t} = useI18n();

const isSuccess = computed(() => !!(props.result && props.result.insertedCount > 0));
</script>

<template>
    <div class="flex h-full items-center justify-center p-6">
        <div class="w-full max-w-md text-center">
            <div class="mb-6 flex justify-center">
                <div
                    :class="
                        cn(
                            'relative flex h-24 w-24 items-center justify-center rounded-full transition-shadow',
                            isSuccess ? 'bg-brand-gradient shadow-glow' : 'bg-muted',
                        )
                    ">
                    <span
                        v-if="isSuccess"
                        aria-hidden="true"
                        class="bg-brand-gradient absolute -inset-2 rounded-full opacity-40 blur-lg"></span>
                    <Icon
                        :class="cn('relative h-11 w-11', isSuccess ? 'text-white' : 'text-muted-foreground')"
                        :name="isSuccess ? 'iconoir:check-circle' : 'iconoir:info-circle'" />
                </div>
            </div>

            <h2 class="font-heading mb-2 text-2xl font-semibold tracking-tight">
                {{ t("import.result.title") }}
            </h2>

            <p class="text-muted-foreground mb-6">
                {{ t("import.result.description") }}
            </p>

            <!-- Stats -->
            <div class="mb-8 grid gap-4 md:grid-cols-2">
                <div class="bg-success/5 border-success/20 rounded-2xl border p-4">
                    <div class="font-heading text-success text-3xl font-semibold tabular-nums">
                        {{ result?.insertedCount ?? 0 }}
                    </div>
                    <div class="text-muted-foreground text-sm">
                        {{ t("import.result.imported") }}
                    </div>
                </div>

                <div class="bg-warning/5 border-warning/20 rounded-2xl border p-4">
                    <div class="font-heading text-warning text-3xl font-semibold tabular-nums">
                        {{ result?.duplicatesInDb ?? 0 }}
                    </div>
                    <div class="text-muted-foreground text-sm">
                        {{ t("import.result.skipped") }}
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-center gap-3">
                <Button variant="outline" @click="emit('reset')">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:plus" />
                    {{ t("import.result.newImport") }}
                </Button>
                <Button
                    class="bg-brand-gradient hover:shadow-glow text-white hover:brightness-110"
                    @click="emit('done')">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:check" />
                    {{ t("import.result.done") }}
                </Button>
            </div>
        </div>
    </div>
</template>
