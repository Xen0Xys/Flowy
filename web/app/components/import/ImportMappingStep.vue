<script setup lang="ts">
import type {ColumnMapping} from "~/composables/useImportState";

const props = defineProps<{
    rows: string[][];
    hasHeaders: boolean;
    mapping: ColumnMapping;
}>();

const emit = defineEmits<{
    (e: "update:mapping", mapping: ColumnMapping): void;
    (e: "parse"): void;
}>();

const {t} = useI18n();

const columnOptions = computed(() => {
    const headers = props.hasHeaders ? props.rows[0] : null;
    const count = props.rows[0]?.length ?? 0;
    const options: {value: number; label: string}[] = [];

    for (let i = 0; i < count; i++) {
        options.push({
            value: i,
            label: headers?.[i] ? `${i + 1}: ${headers[i]}` : `${t("import.mapping.column")} ${i + 1}`,
        });
    }

    return options;
});

const previewRows = computed(() => {
    const maxRows = 5;
    return props.hasHeaders ? props.rows.slice(1, maxRows + 1) : props.rows.slice(0, maxRows);
});

// Local state for amount mode (single vs dual)
// Initialize based on current mapping
const isDualAmount = ref(props.mapping.credit !== null || props.mapping.debit !== null);

// Flag to prevent watch from firing on initialization
const isInitialized = ref(false);

onMounted(() => {
    // Allow watch to fire after mount
    nextTick(() => {
        isInitialized.value = true;
    });
});

// Watch for mode changes and update mapping accordingly
watch(isDualAmount, (isDual) => {
    if (!isInitialized.value) return;

    if (isDual) {
        // Switch to dual: clear amount
        emit("update:mapping", {
            ...props.mapping,
            amount: null,
        });
    } else {
        // Switch to single: clear credit/debit
        emit("update:mapping", {
            ...props.mapping,
            credit: null,
            debit: null,
        });
    }
});

function handleMappingUpdate(field: keyof ColumnMapping, value: number | null) {
    emit("update:mapping", {...props.mapping, [field]: value});
}

const canProceed = computed(() => {
    const {date, description, amount, credit, debit} = props.mapping;

    const hasRequired = date !== null && description !== null;

    if (!isDualAmount.value) {
        return hasRequired && amount !== null;
    }

    return hasRequired && (credit !== null || debit !== null);
});
</script>

<template>
    <div class="p-6">
        <div class="mx-auto max-w-4xl space-y-6">
            <div>
                <h2 class="text-lg font-semibold">{{ t("import.mapping.title") }}</h2>
                <p class="text-muted-foreground text-sm">{{ t("import.mapping.description") }}</p>
            </div>

            <!-- Required Fields -->
            <div class="space-y-4">
                <h3 class="font-medium">{{ t("import.mapping.requiredFields") }}</h3>

                <div class="grid gap-4 md:grid-cols-3">
                    <div class="space-y-2">
                        <Label class="flex items-center gap-2">
                            <Icon name="iconoir:calendar" class="h-4 w-4" />
                            {{ t("import.mapping.fields.date") }}
                        </Label>
                        <Select
                            :model-value="mapping.date?.toString()"
                            @update:model-value="handleMappingUpdate('date', $event ? parseInt($event) : null)">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('import.mapping.selectColumn')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="opt in columnOptions" :key="opt.value" :value="opt.value.toString()">
                                    {{ opt.label }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="space-y-2">
                        <Label class="flex items-center gap-2">
                            <Icon name="iconoir:text" class="h-4 w-4" />
                            {{ t("import.mapping.fields.description") }}
                        </Label>
                        <Select
                            :model-value="mapping.description?.toString()"
                            @update:model-value="handleMappingUpdate('description', $event ? parseInt($event) : null)">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('import.mapping.selectColumn')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="opt in columnOptions" :key="opt.value" :value="opt.value.toString()">
                                    {{ opt.label }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <!-- Amount section with switch -->
                <div class="space-y-4">
                    <div class="flex items-center justify-between">
                        <Label class="flex items-center gap-2">
                            <Icon name="iconoir:dollar" class="h-4 w-4" />
                            {{ t("import.mapping.fields.amount") }}
                        </Label>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-sm">{{ t("import.mapping.singleColumn") }}</span>
                            <Switch v-model="isDualAmount" />
                            <span class="text-muted-foreground text-sm">{{ t("import.mapping.dualColumn") }}</span>
                        </div>
                    </div>

                    <!-- Single column amount -->
                    <div v-if="!isDualAmount" class="max-w-xs space-y-2">
                        <Select
                            :model-value="mapping.amount?.toString()"
                            @update:model-value="handleMappingUpdate('amount', $event ? parseInt($event) : null)">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('import.mapping.selectColumn')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="opt in columnOptions" :key="opt.value" :value="opt.value.toString()">
                                    {{ opt.label }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <p class="text-muted-foreground text-xs">
                            {{ t("import.mapping.amountHint") }}
                        </p>
                    </div>

                    <!-- Dual column amount -->
                    <div v-else class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label class="text-green-600 dark:text-green-400">
                                {{ t("import.mapping.fields.credit") }}
                            </Label>
                            <Select
                                :model-value="mapping.credit?.toString()"
                                @update:model-value="handleMappingUpdate('credit', $event ? parseInt($event) : null)">
                                <SelectTrigger>
                                    <SelectValue :placeholder="t('import.mapping.selectColumn')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="opt in columnOptions"
                                        :key="opt.value"
                                        :value="opt.value.toString()">
                                        {{ opt.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-2">
                            <Label class="text-red-600 dark:text-red-400">
                                {{ t("import.mapping.fields.debit") }}
                            </Label>
                            <Select
                                :model-value="mapping.debit?.toString()"
                                @update:model-value="handleMappingUpdate('debit', $event ? parseInt($event) : null)">
                                <SelectTrigger>
                                    <SelectValue :placeholder="t('import.mapping.selectColumn')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="opt in columnOptions"
                                        :key="opt.value"
                                        :value="opt.value.toString()">
                                        {{ opt.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Preview -->
            <div class="space-y-2">
                <h3 class="font-medium">{{ t("import.mapping.preview") }}</h3>
                <div class="overflow-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead class="w-12">#</TableHead>
                                <TableHead v-if="mapping.date !== null" class="min-w-[100px]">
                                    {{ t("import.mapping.fields.date") }}
                                </TableHead>
                                <TableHead v-if="mapping.description !== null" class="min-w-[200px]">
                                    {{ t("import.mapping.fields.description") }}
                                </TableHead>
                                <TableHead v-if="mapping.amount !== null" class="min-w-[100px]">
                                    {{ t("import.mapping.fields.amount") }}
                                </TableHead>
                                <TableHead v-if="mapping.credit !== null" class="min-w-[100px]">
                                    {{ t("import.mapping.fields.credit") }}
                                </TableHead>
                                <TableHead v-if="mapping.debit !== null" class="min-w-[100px]">
                                    {{ t("import.mapping.fields.debit") }}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                                <TableCell class="text-muted-foreground w-12">
                                    {{ hasHeaders ? rowIndex + 2 : rowIndex + 1 }}
                                </TableCell>
                                <TableCell v-if="mapping.date !== null">
                                    {{ row[mapping.date] || "-" }}
                                </TableCell>
                                <TableCell v-if="mapping.description !== null" class="max-w-[300px] truncate">
                                    {{ row[mapping.description] || "-" }}
                                </TableCell>
                                <TableCell v-if="mapping.amount !== null">
                                    {{ row[mapping.amount] || "-" }}
                                </TableCell>
                                <TableCell v-if="mapping.credit !== null" class="text-green-600 dark:text-green-400">
                                    {{ row[mapping.credit] || "-" }}
                                </TableCell>
                                <TableCell v-if="mapping.debit !== null" class="text-red-600 dark:text-red-400">
                                    {{ row[mapping.debit] || "-" }}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end">
                <Button :disabled="!canProceed" @click="emit('parse')">
                    {{ t("import.mapping.parseAndPreview") }}
                    <Icon name="iconoir:arrow-right" class="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    </div>
</template>
