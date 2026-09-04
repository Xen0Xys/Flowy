<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import type {RecurrenceFrequency, RecurringTransaction} from "~/stores/recurring-transaction.store";
import {toCurrency} from "~/lib/currency";
import {Switch} from "~/components/ui/switch";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";

const DAY_MS = 24 * 60 * 60 * 1000;
const FREQUENCY_DAYS: Record<RecurrenceFrequency, number> = {
    WEEKLY: 7,
    MONTHLY: 30,
    BIMONTHLY: 60,
    QUARTERLY: 90,
    SEMIANNUAL: 182,
    YEARLY: 365,
};

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

const progress = computed(() => {
    const rt = props.recurringTransaction;
    const now = Date.now();
    const nextRun = new Date(rt.nextRunAt).getTime();
    const periodStart = rt.lastRunAt
        ? new Date(rt.lastRunAt).getTime()
        : nextRun - FREQUENCY_DAYS[rt.frequency] * DAY_MS;
    const total = nextRun - periodStart;
    const elapsed = now - periodStart;
    const percent = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 100;
    const daysRemaining = Math.max(0, Math.ceil((nextRun - now) / DAY_MS));
    return {percent, daysRemaining};
});

const remainingLabel = computed(() => {
    const days = progress.value.daysRemaining;
    if (days === 0) return t("recurring.list.today");
    if (days === 1) return t("recurring.list.tomorrow");
    return t("recurring.list.daysRemaining", {count: days});
});

const stopClick = (event: Event) => event.stopPropagation();
</script>

<template>
    <div
        class="hover:bg-muted/50 flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors"
        @click="emit('click')">
        <div class="flex items-center gap-3">
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

            <div class="shrink-0">
                <span :class="['text-sm font-semibold tabular-nums', isExpense ? 'text-destructive' : 'text-success']">
                    {{ isExpense ? "-" : "+" }}{{ toCurrency(Math.abs(recurringTransaction.amount), currency) }}
                </span>
            </div>

            <div class="shrink-0 pl-2" @click.stop>
                <Switch
                    :model-value="recurringTransaction.isEnabled"
                    @update:model-value="(v) => emit('toggle', v)"
                    @click="stopClick" />
            </div>
        </div>

        <div class="flex items-center gap-3 pl-13">
            <div
                :class="[
                    'bg-muted h-1.5 flex-1 overflow-hidden rounded-full',
                    !recurringTransaction.isEnabled && 'opacity-50',
                ]">
                <div
                    :class="[
                        'h-full rounded-full transition-[width]',
                        recurringTransaction.isFailing ? 'bg-destructive' : 'bg-primary',
                    ]"
                    :style="{width: progress.percent + '%'}" />
            </div>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger as-child>
                        <span
                            :class="[
                                'text-muted-foreground shrink-0 text-xs tabular-nums',
                                !recurringTransaction.isEnabled && 'opacity-50',
                            ]">
                            {{ remainingLabel }}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{{ t("recurring.list.nextRun") }}: {{ nextRunLabel }}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    </div>
</template>
