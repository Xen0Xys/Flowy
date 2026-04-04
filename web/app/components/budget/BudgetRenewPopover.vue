<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import type {AvailableMonth} from "~/stores/budget.store";
import {Button} from "~/components/ui/button";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "~/components/ui/dropdown-menu";

const props = defineProps<{
    availableMonths: AvailableMonth[];
    disabled?: boolean;
}>();

const emit = defineEmits<{
    select: [month: AvailableMonth];
}>();

const {t} = useI18n();

const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const formattedMonths = computed(() => {
    return props.availableMonths.map((m) => ({
        ...m,
        label: `${monthNames[m.month - 1]} ${m.year}`,
    }));
});

function onSelect(month: AvailableMonth) {
    emit("select", month);
}
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button :disabled="disabled || formattedMonths.length === 0" variant="outline">
                <Icon class="mr-2 h-4 w-4" name="iconoir:data-transfer-both" />
                {{ t("budget.page.renewBudget") }}
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem v-if="formattedMonths.length === 0" disabled>
                {{ t("budget.page.noPreviousBudget") }}
            </DropdownMenuItem>
            <DropdownMenuItem
                v-for="month in formattedMonths"
                :key="`${month.year}-${month.month}`"
                @select="onSelect(month)">
                {{ month.label }}
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
