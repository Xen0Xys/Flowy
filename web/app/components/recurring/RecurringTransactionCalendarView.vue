<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import type {RecurringCalendar, RecurringTransaction} from "~/stores/recurring-transaction.store";
import {toCurrency} from "~/lib/currency";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";

const props = defineProps<{
    calendar: RecurringCalendar | null;
    currency: string;
}>();

const emit = defineEmits<{
    (e: "select", rt: RecurringTransaction): void;
}>();

const {t, locale} = useI18n();

const rtById = computed(() => {
    if (!props.calendar) return new Map<string, RecurringTransaction>();
    return new Map(props.calendar.recurringTransactions.map((rt) => [rt.id, rt]));
});

type CalendarCell = {
    key: string;
    dayNumber: number | null;
    dateKey: string | null;
    inMonth: boolean;
    isToday: boolean;
    occurrences: {rt: RecurringTransaction; scheduledFor: string}[];
};

const daysOfWeekLabels = computed(() => {
    const monday = new Date(Date.UTC(2026, 2, 2)); // 2026-03-02 = Monday
    return Array.from({length: 7}, (_, i) => {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + i);
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {weekday: "short", timeZone: "UTC"}).format(d);
    });
});

const cells = computed<CalendarCell[]>(() => {
    if (!props.calendar) return [];
    const {year, month} = props.calendar;
    const firstOfMonth = new Date(year, month - 1, 1);
    // Monday-first week: JS getDay returns 0=Sun..6=Sat. Convert to 0=Mon..6=Sun.
    const jsDay = firstOfMonth.getDay();
    const leading = jsDay === 0 ? 6 : jsDay - 1;
    const totalDays = new Date(year, month, 0).getDate();

    const occurrencesByDate = new Map<string, {rt: RecurringTransaction; scheduledFor: string}[]>();
    for (const occ of props.calendar.occurrences) {
        const rt = rtById.value.get(occ.recurringTransactionId);
        if (!rt) continue;
        const bucket = occurrencesByDate.get(occ.localDate) ?? [];
        bucket.push({rt, scheduledFor: occ.scheduledFor});
        occurrencesByDate.set(occ.localDate, bucket);
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

    const result: CalendarCell[] = [];
    for (let i = 0; i < leading; i++) {
        result.push({key: `lead-${i}`, dayNumber: null, dateKey: null, inMonth: false, isToday: false, occurrences: []});
    }
    for (let day = 1; day <= totalDays; day++) {
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        const dateKey = `${year}-${mm}-${dd}`;
        result.push({
            key: `day-${day}`,
            dayNumber: day,
            dateKey,
            inMonth: true,
            isToday: isCurrentMonth && today.getDate() === day,
            occurrences: occurrencesByDate.get(dateKey) ?? [],
        });
    }
    const trailing = (7 - (result.length % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
        result.push({
            key: `trail-${i}`,
            dayNumber: null,
            dateKey: null,
            inMonth: false,
            isToday: false,
            occurrences: [],
        });
    }
    return result;
});
</script>

<template>
    <div v-if="calendar" class="flex flex-col gap-3">
        <div class="grid grid-cols-7 gap-1">
            <div
                v-for="label in daysOfWeekLabels"
                :key="label"
                class="text-muted-foreground py-2 text-center text-xs font-medium tracking-wide uppercase">
                {{ label }}
            </div>
        </div>
        <div class="grid grid-cols-7 gap-1">
            <div
                v-for="cell in cells"
                :key="cell.key"
                :class="[
                    'flex min-h-24 flex-col gap-1 rounded-md border p-1.5',
                    cell.inMonth ? 'bg-card' : 'bg-muted/30 border-dashed',
                    cell.isToday && 'border-primary ring-primary ring-offset-background ring-2 ring-offset-1',
                ]">
                <span
                    v-if="cell.dayNumber !== null"
                    :class="[
                        'text-xs tabular-nums',
                        cell.isToday ? 'text-primary font-semibold' : 'text-muted-foreground font-medium',
                    ]">
                    {{ cell.dayNumber }}
                </span>
                <div class="flex flex-col gap-1">
                    <TooltipProvider v-for="(occ, idx) in cell.occurrences" :key="idx">
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <button
                                    type="button"
                                    :style="{
                                        backgroundColor: occ.rt.category?.hexColor
                                            ? `${occ.rt.category.hexColor}22`
                                            : undefined,
                                        color: occ.rt.category?.hexColor ?? undefined,
                                    }"
                                    class="hover:bg-muted flex items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs transition"
                                    @click="emit('select', occ.rt)">
                                    <Icon v-if="occ.rt.category" :name="occ.rt.category.icon" class="size-3 shrink-0" />
                                    <Icon
                                        v-else
                                        :name="occ.rt.amount < 0 ? 'iconoir:arrow-down-right' : 'iconoir:arrow-up-right'"
                                        class="size-3 shrink-0" />
                                    <span class="truncate">{{ occ.rt.name }}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <div class="flex flex-col gap-0.5">
                                    <span class="font-medium">{{ occ.rt.name }}</span>
                                    <span class="text-xs tabular-nums">
                                        {{ toCurrency(occ.rt.amount, currency) }}
                                    </span>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </div>
    </div>
</template>
