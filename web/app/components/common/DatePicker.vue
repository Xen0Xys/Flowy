<script lang="ts" setup>
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {CalendarDate, getLocalTimeZone} from "@internationalized/date";
import type {DateValue} from "reka-ui";
import {Calendar as CalendarIcon} from "lucide-vue-next";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Calendar} from "@/components/ui/calendar";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";

const props = withDefaults(
    defineProps<{
        modelValue: string;
        placeholder?: string;
        disabled?: boolean;
        id?: string;
        class?: string;
    }>(),
    {
        placeholder: undefined,
        disabled: false,
    },
);

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
}>();

const {locale} = useI18n();
const isOpen = ref(false);

const parseModelValue = (value: string): CalendarDate | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return new CalendarDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};

const calendarValue = computed<DateValue | undefined>({
    get: () => parseModelValue(props.modelValue),
    set: (value) => {
        if (!value) {
            emit("update:modelValue", "");
            return;
        }
        const date = value.toDate(getLocalTimeZone());
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        emit("update:modelValue", `${y}-${m}-${d}`);
        isOpen.value = false;
    },
});

const dateFormatter = computed(
    () =>
        new Intl.DateTimeFormat(locale.value || "en-US", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
        }),
);

const formattedDate = computed(() => {
    const value = parseModelValue(props.modelValue);
    if (!value) return props.placeholder ?? "";
    return dateFormatter.value.format(value.toDate(getLocalTimeZone()));
});

const hasValue = computed(() => Boolean(parseModelValue(props.modelValue)));
</script>

<template>
    <Popover v-model:open="isOpen">
        <PopoverTrigger as-child>
            <Button
                :id="id"
                :disabled="disabled"
                type="button"
                variant="outline"
                :class="
                    cn('w-full justify-start text-left font-normal', !hasValue && 'text-muted-foreground', props.class)
                ">
                <CalendarIcon class="mr-2 h-4 w-4 shrink-0" />
                <span class="truncate">{{ formattedDate }}</span>
            </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-auto p-0">
            <Calendar v-model="calendarValue" :locale="locale || 'en-US'" initial-focus layout="month-and-year">
                <template #calendar-heading="{date, month, year}">
                    <div
                        class="flex items-center justify-center gap-3 px-2 [&_.pointer-events-none.absolute]:!justify-center [&_.pointer-events-none.absolute]:!pr-6 [&_[data-slot=native-select]]:!h-8 [&_[data-slot=native-select]]:!py-0">
                        <component :is="month" :date="date" />
                        <component :is="year" :date="date" />
                    </div>
                </template>
            </Calendar>
        </PopoverContent>
    </Popover>
</template>
