<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import type {RecurringCalendar, RecurringTransaction} from "~/stores/recurring-transaction.store";
import {toCurrency} from "~/lib/currency";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";
import {Sheet, SheetContent, SheetHeader, SheetTitle} from "~/components/ui/sheet";

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

type CalendarOccurrence = {rt: RecurringTransaction; scheduledFor: string};
type CalendarCell = {
    key: string;
    dayNumber: number | null;
    dateKey: string | null;
    inMonth: boolean;
    isToday: boolean;
    occurrences: CalendarOccurrence[];
};

const MOBILE_DOT_LIMIT = 3;

const daysOfWeekLabelsShort = computed(() => {
    const monday = new Date(Date.UTC(2026, 2, 2)); // 2026-03-02 = Monday
    return Array.from({length: 7}, (_, i) => {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + i);
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {weekday: "short", timeZone: "UTC"}).format(d);
    });
});

const daysOfWeekLabelsNarrow = computed(() => {
    const monday = new Date(Date.UTC(2026, 2, 2));
    return Array.from({length: 7}, (_, i) => {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + i);
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {weekday: "narrow", timeZone: "UTC"}).format(d);
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

    const occurrencesByDate = new Map<string, CalendarOccurrence[]>();
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

const isSheetOpen = ref(false);
const selectedCell = ref<CalendarCell | null>(null);

function openDay(cell: CalendarCell) {
    if (!cell.inMonth || cell.occurrences.length === 0) return;
    selectedCell.value = cell;
    isSheetOpen.value = true;
}

function selectOccurrence(rt: RecurringTransaction) {
    isSheetOpen.value = false;
    emit("select", rt);
}

const selectedDayLabel = computed(() => {
    const cell = selectedCell.value;
    if (!cell?.dateKey) return "";
    const [y, m, d] = cell.dateKey.split("-").map(Number);
    if (!y || !m || !d) return "";
    try {
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {dateStyle: "full"}).format(new Date(y, m - 1, d));
    } catch {
        return `${d}/${m}/${y}`;
    }
});

function dotColor(occ: CalendarOccurrence) {
    return occ.rt.category?.hexColor ?? (occ.rt.amount < 0 ? "var(--destructive)" : "var(--success)");
}
</script>

<template>
    <div v-if="calendar" class="flex flex-col gap-2 md:gap-3">
        <div class="grid grid-cols-7 gap-0.5 md:gap-1">
            <div
                v-for="(label, idx) in daysOfWeekLabelsNarrow"
                :key="`narrow-${idx}`"
                class="text-muted-foreground py-1 text-center text-[10px] font-medium tracking-wide uppercase md:hidden">
                {{ label }}
            </div>
            <div
                v-for="(label, idx) in daysOfWeekLabelsShort"
                :key="`short-${idx}`"
                class="text-muted-foreground hidden py-2 text-center text-xs font-medium tracking-wide uppercase md:block">
                {{ label }}
            </div>
        </div>
        <div class="grid grid-cols-7 gap-0.5 md:gap-1">
            <div
                v-for="cell in cells"
                :key="cell.key"
                :class="[
                    'flex min-h-14 flex-col gap-0.5 rounded-md border p-1 md:min-h-24 md:gap-1 md:p-1.5',
                    cell.inMonth ? 'bg-card' : 'bg-muted/30 border-dashed',
                    cell.isToday &&
                        'border-primary ring-primary ring-offset-background ring-1 md:ring-2 md:ring-offset-1',
                    cell.inMonth && cell.occurrences.length > 0 && 'cursor-pointer md:cursor-default',
                ]"
                :role="cell.inMonth && cell.occurrences.length > 0 ? 'button' : undefined"
                :tabindex="cell.inMonth && cell.occurrences.length > 0 ? 0 : undefined"
                @click="openDay(cell)"
                @keydown.enter.prevent="openDay(cell)"
                @keydown.space.prevent="openDay(cell)">
                <span
                    v-if="cell.dayNumber !== null"
                    :class="[
                        'text-[10px] tabular-nums md:text-xs',
                        cell.isToday ? 'text-primary font-semibold' : 'text-muted-foreground font-medium',
                    ]">
                    {{ cell.dayNumber }}
                </span>

                <div v-if="cell.occurrences.length > 0" class="flex flex-wrap items-center gap-0.5 md:hidden">
                    <span
                        v-for="(occ, idx) in cell.occurrences.slice(0, MOBILE_DOT_LIMIT)"
                        :key="`dot-${idx}`"
                        class="size-1.5 rounded-full"
                        :style="{backgroundColor: dotColor(occ)}" />
                    <span
                        v-if="cell.occurrences.length > MOBILE_DOT_LIMIT"
                        class="text-muted-foreground text-[9px] leading-none font-semibold tabular-nums">
                        +{{ cell.occurrences.length - MOBILE_DOT_LIMIT }}
                    </span>
                </div>

                <div class="hidden flex-col gap-1 md:flex">
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
                                    @click.stop="emit('select', occ.rt)">
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

        <Sheet v-model:open="isSheetOpen">
            <SheetContent side="bottom" class="max-h-[80vh] gap-0 overflow-hidden rounded-t-xl p-0">
                <SheetHeader class="border-b px-4 py-3">
                    <SheetTitle class="text-base">
                        {{ t("recurring.calendar.dayOccurrences", {date: selectedDayLabel}) }}
                    </SheetTitle>
                </SheetHeader>
                <div class="flex max-h-[calc(80vh-3.5rem)] flex-col gap-2 overflow-y-auto p-3">
                    <button
                        v-for="(occ, idx) in selectedCell?.occurrences ?? []"
                        :key="idx"
                        type="button"
                        class="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 text-left transition-colors"
                        @click="selectOccurrence(occ.rt)">
                        <div
                            :class="[
                                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                                occ.rt.amount < 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                            ]"
                            :style="
                                occ.rt.category?.hexColor
                                    ? {
                                          backgroundColor: `${occ.rt.category.hexColor}22`,
                                          color: occ.rt.category.hexColor,
                                      }
                                    : undefined
                            ">
                            <Icon
                                :name="
                                    occ.rt.category?.icon ??
                                    (occ.rt.amount < 0 ? 'iconoir:arrow-down-right' : 'iconoir:arrow-up-right')
                                "
                                class="size-5" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-medium">{{ occ.rt.name }}</div>
                            <div class="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                                <span
                                    v-if="occ.rt.category"
                                    class="flex items-center gap-1"
                                    :style="{color: occ.rt.category.hexColor}">
                                    <Icon class="size-3" :name="occ.rt.category.icon" />
                                    {{ occ.rt.category.name }}
                                </span>
                                <span v-if="occ.rt.merchant" class="flex items-center gap-1">
                                    <Icon class="size-3" name="iconoir:shop" />
                                    {{ occ.rt.merchant.name }}
                                </span>
                                <span class="flex items-center gap-1">
                                    <Icon class="size-3" name="iconoir:calendar" />
                                    {{ t(`recurring.frequency.${occ.rt.frequency.toLowerCase()}`) }}
                                </span>
                            </div>
                        </div>
                        <span
                            :class="[
                                'shrink-0 text-sm font-semibold tabular-nums',
                                occ.rt.amount < 0 ? 'text-destructive' : 'text-success',
                            ]">
                            {{ occ.rt.amount < 0 ? "-" : "+" }}{{ toCurrency(Math.abs(occ.rt.amount), currency) }}
                        </span>
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    </div>
</template>
