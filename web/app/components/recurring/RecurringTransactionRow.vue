<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import type {RecurringTransaction} from "~/stores/recurring-transaction.store";
import {toCurrency} from "~/lib/currency";
import {Switch} from "~/components/ui/switch";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";

const props = defineProps<{
    recurringTransaction: RecurringTransaction;
    currency: string;
    accountName?: string;
}>();

const emit = defineEmits<{
    (e: "click"): void;
    (e: "toggle", value: boolean): void;
}>();

const {t, locale} = useI18n();

const isExpense = computed(() => props.recurringTransaction.amount < 0);

const dayLabel = computed(() => {
    const rt = props.recurringTransaction;
    if (rt.frequency === "WEEKLY") {
        const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        return t(`recurring.dayOfWeek.${keys[rt.dayOfWeek ?? 0]}`);
    }
    return `${t("recurring.list.day")} ${rt.dayOfMonth}`;
});

const nextRunLabel = computed(() => {
    const rt = props.recurringTransaction;
    try {
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {
            timeZone: rt.timezone,
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(rt.nextRunAt));
    } catch {
        return new Date(rt.nextRunAt).toLocaleDateString();
    }
});

const stopClick = (event: Event) => event.stopPropagation();
</script>

<template>
    <div
        class="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors"
        @click="emit('click')">
        <div
            :class="[
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                isExpense ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
            ]">
            <Icon :name="isExpense ? 'iconoir:arrow-down-right' : 'iconoir:arrow-up-right'" class="size-5" />
        </div>

        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ recurringTransaction.name }}</span>
                <TooltipProvider v-if="recurringTransaction.isFailing">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Icon class="text-destructive size-4" name="iconoir:warning-triangle" />
                        </TooltipTrigger>
                        <TooltipContent>{{ t("recurring.list.failingTooltip") }}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider v-if="!recurringTransaction.isEnabled">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Icon class="text-muted-foreground size-4" name="iconoir:pause" />
                        </TooltipTrigger>
                        <TooltipContent>{{ t("recurring.list.disabledTooltip") }}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <div class="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <span v-if="accountName" class="flex items-center gap-1">
                    <Icon class="size-3" name="iconoir:wallet" />
                    {{ accountName }}
                </span>
                <span
                    v-if="recurringTransaction.category"
                    class="flex items-center gap-1"
                    :style="{color: recurringTransaction.category.hexColor}">
                    <Icon class="size-3" :name="recurringTransaction.category.icon" />
                    {{ recurringTransaction.category.name }}
                </span>
                <span v-if="recurringTransaction.merchant" class="flex items-center gap-1">
                    <Icon class="size-3" name="iconoir:shop" />
                    {{ recurringTransaction.merchant.name }}
                </span>
                <span class="flex items-center gap-1">
                    <Icon class="size-3" name="iconoir:calendar" />
                    {{ t(`recurring.frequency.${recurringTransaction.frequency.toLowerCase()}`) }} · {{ dayLabel }}
                </span>
            </div>
        </div>

        <div class="flex shrink-0 flex-col items-end gap-1">
            <span :class="['text-sm font-semibold tabular-nums', isExpense ? 'text-destructive' : 'text-success']">
                {{ isExpense ? "-" : "+" }}{{ toCurrency(Math.abs(recurringTransaction.amount), currency) }}
            </span>
            <span class="text-muted-foreground text-xs"> {{ t("recurring.list.nextRun") }}: {{ nextRunLabel }} </span>
        </div>

        <div class="shrink-0 pl-2" @click.stop>
            <Switch
                :model-value="recurringTransaction.isEnabled"
                @update:model-value="(v) => emit('toggle', v)"
                @click="stopClick" />
        </div>
    </div>
</template>
