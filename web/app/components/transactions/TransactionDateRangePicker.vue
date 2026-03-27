<script setup lang="ts">
import {ref, computed} from "vue";
import {useMediaQuery} from "@vueuse/core";
import type {DateRange} from "reka-ui";
import {Calendar as CalendarIcon} from "lucide-vue-next";
import {getLocalTimeZone} from "@internationalized/date";

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

const internalValue = computed({
    get: () => props.modelValue,
    set: (val) => emit("update:modelValue", val),
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
});

const formattedDate = computed(() => {
    if (internalValue.value?.start) {
        // internalValue.value.start is a CalendarDate from @internationalized/date
        const startDate = (internalValue.value.start as any).toDate(getLocalTimeZone());

        if (internalValue.value.end) {
            const endDate = (internalValue.value.end as any).toDate(getLocalTimeZone());
            return `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate)}`;
        }
        return dateFormatter.format(startDate);
    }
    return "Pick a date range";
});
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
                <RangeCalendar
                    v-model="internalValue"
                    initial-focus
                    :number-of-months="isMobile ? 1 : 2"
                    @update:start-value="(startDate) => (internalValue.start = startDate)" />
            </PopoverContent>
        </Popover>
    </div>
</template>
