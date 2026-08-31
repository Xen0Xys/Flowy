<script setup lang="ts">
import {computed} from "vue";
import {useMediaQuery} from "@vueuse/core";
import {useI18n} from "vue-i18n";
import type {DateRange} from "reka-ui";
import {Calendar as CalendarIcon} from "lucide-vue-next";
import {CalendarDate, getLocalTimeZone} from "@internationalized/date";

import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {RangeCalendar} from "@/components/ui/range-calendar";

const props = defineProps<{
    modelValue?: DateRange;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: DateRange | undefined): void;
}>();

const isMobile = useMediaQuery("(max-width: 768px)");
const {locale, t} = useI18n();

const internalValue = computed({
    get: () => props.modelValue,
    set: (val) => emit("update:modelValue", val),
});

const dateFormatter = computed(
    () =>
        new Intl.DateTimeFormat(locale.value || "en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        }),
);

const formattedDate = computed(() => {
    if (internalValue.value?.start) {
        const startDate = (internalValue.value.start as any).toDate(getLocalTimeZone());

        if (internalValue.value.end) {
            const endDate = (internalValue.value.end as any).toDate(getLocalTimeZone());
            return `${dateFormatter.value.format(startDate)} - ${dateFormatter.value.format(endDate)}`;
        }
        return dateFormatter.value.format(startDate);
    }
    return t("transactions.filters.pickDateRange");
});

const toCalendarDate = (date: Date): CalendarDate =>
    new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());

type Preset = {
    key: string;
    label: string;
    getRange: () => {start: CalendarDate; end: CalendarDate};
};

const presets = computed<Preset[]>(() => [
    {
        key: "today",
        label: t("transactions.filters.presets.today"),
        getRange: () => {
            const today = toCalendarDate(new Date());
            return {start: today, end: today};
        },
    },
    {
        key: "yesterday",
        label: t("transactions.filters.presets.yesterday"),
        getRange: () => {
            const now = new Date();
            now.setDate(now.getDate() - 1);
            const yesterday = toCalendarDate(now);
            return {start: yesterday, end: yesterday};
        },
    },
    {
        key: "last7",
        label: t("transactions.filters.presets.last7"),
        getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 6);
            return {start: toCalendarDate(start), end: toCalendarDate(end)};
        },
    },
    {
        key: "last30",
        label: t("transactions.filters.presets.last30"),
        getRange: () => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 29);
            return {start: toCalendarDate(start), end: toCalendarDate(end)};
        },
    },
    {
        key: "thisMonth",
        label: t("transactions.filters.presets.thisMonth"),
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return {start: toCalendarDate(start), end: toCalendarDate(end)};
        },
    },
    {
        key: "lastMonth",
        label: t("transactions.filters.presets.lastMonth"),
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return {start: toCalendarDate(start), end: toCalendarDate(end)};
        },
    },
    {
        key: "thisYear",
        label: t("transactions.filters.presets.thisYear"),
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 1);
            const end = new Date(now.getFullYear(), 11, 31);
            return {start: toCalendarDate(start), end: toCalendarDate(end)};
        },
    },
]);

const applyPreset = (preset: Preset) => {
    const {start, end} = preset.getRange();
    internalValue.value = {start, end};
};

const clearRange = () => {
    internalValue.value = {start: undefined, end: undefined};
};

const isActivePreset = (preset: Preset): boolean => {
    const start = internalValue.value?.start as CalendarDate | undefined;
    const end = internalValue.value?.end as CalendarDate | undefined;
    if (!start || !end) return false;
    const range = preset.getRange();
    return (
        start.year === range.start.year &&
        start.month === range.start.month &&
        start.day === range.start.day &&
        end.year === range.end.year &&
        end.month === range.end.month &&
        end.day === range.end.day
    );
};

const hasSelection = computed(() => Boolean(internalValue.value?.start || internalValue.value?.end));
</script>

<template>
    <div :class="cn('grid gap-2', $attrs.class ?? '')">
        <Popover>
            <PopoverTrigger as-child>
                <Button
                    id="date"
                    :variant="'outline'"
                    :class="
                        cn(
                            'w-full justify-start text-left font-normal md:w-[260px]',
                            !internalValue?.start && 'text-muted-foreground',
                        )
                    ">
                    <CalendarIcon class="mr-2 h-4 w-4" />
                    {{ formattedDate }}
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" align="start">
                <div class="flex flex-col md:flex-row">
                    <div
                        class="border-b p-2 md:w-40 md:border-r md:border-b-0"
                        role="group"
                        :aria-label="t('transactions.filters.presets.title')">
                        <div class="grid grid-cols-2 gap-1 md:flex md:flex-col">
                            <Button
                                v-for="preset in presets"
                                :key="preset.key"
                                :variant="isActivePreset(preset) ? 'secondary' : 'ghost'"
                                size="sm"
                                class="justify-start"
                                type="button"
                                @click="applyPreset(preset)">
                                {{ preset.label }}
                            </Button>
                            <Button
                                v-if="hasSelection"
                                variant="ghost"
                                size="sm"
                                class="justify-start"
                                type="button"
                                @click="clearRange">
                                <Icon name="iconoir:cancel" class="mr-1 h-3.5 w-3.5" />
                                {{ t("transactions.filters.presets.clear") }}
                            </Button>
                        </div>
                    </div>
                    <RangeCalendar
                        v-model="internalValue"
                        initial-focus
                        :number-of-months="isMobile ? 1 : 2"
                        @update:start-value="(startDate) => (internalValue = {start: startDate})" />
                </div>
            </PopoverContent>
        </Popover>
    </div>
</template>
