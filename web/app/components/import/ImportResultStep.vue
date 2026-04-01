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
</script>

<template>
    <div class="flex h-full items-center justify-center p-6">
        <div class="w-full max-w-md text-center">
            <div class="mb-6 flex justify-center">
                <div
                    :class="
                        cn(
                            'flex h-20 w-20 items-center justify-center rounded-full',
                            result && result.insertedCount > 0 ? 'bg-green-500/10' : 'bg-muted',
                        )
                    ">
                    <Icon
                        :class="
                            cn(
                                'h-10 w-10',
                                result && result.insertedCount > 0 ? 'text-green-500' : 'text-muted-foreground',
                            )
                        "
                        :name="result && result.insertedCount > 0 ? 'iconoir:check-circle' : 'iconoir:info-circle'" />
                </div>
            </div>

            <h2 class="mb-2 text-2xl font-semibold">
                {{ t("import.result.title") }}
            </h2>

            <p class="text-muted-foreground mb-6">
                {{ t("import.result.description") }}
            </p>

            <!-- Stats -->
            <div class="mb-8 grid gap-4 md:grid-cols-2">
                <div class="rounded-lg border bg-green-500/5 p-4">
                    <div class="text-3xl font-bold text-green-600 dark:text-green-400">
                        {{ result?.insertedCount ?? 0 }}
                    </div>
                    <div class="text-muted-foreground text-sm">
                        {{ t("import.result.imported") }}
                    </div>
                </div>

                <div class="rounded-lg border bg-orange-500/5 p-4">
                    <div class="text-3xl font-bold text-orange-600 dark:text-orange-400">
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
                <Button @click="emit('done')">
                    <Icon class="mr-2 h-4 w-4" name="iconoir:check" />
                    {{ t("import.result.done") }}
                </Button>
            </div>
        </div>
    </div>
</template>
