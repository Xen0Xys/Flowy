<script lang="ts" setup>
import type {Delimiter} from "~/composables/useCsvParser";

const props = defineProps<{
    rows: string[][];
    delimiter: Delimiter;
    hasHeaders: boolean;
    fileName?: string;
}>();

const emit = defineEmits<{
    (e: "update:delimiter", delimiter: Delimiter): void;
    (e: "update:hasHeaders", value: boolean): void;
    (e: "next"): void;
}>();

const {t} = useI18n();

const delimiterOptions: {value: Delimiter; label: string}[] = [
    {value: ",", label: ", (comma)"},
    {value: ";", label: "; (semicolon)"},
    {value: "\t", label: "\\t (tab)"},
    {value: "|", label: "| (pipe)"},
];

const previewRows = computed(() => {
    const maxRows = 10;
    const rows = props.hasHeaders ? props.rows.slice(1, maxRows + 1) : props.rows.slice(0, maxRows);
    return rows;
});

const headers = computed(() => {
    return props.hasHeaders ? props.rows[0] : null;
});

const columnCount = computed(() => {
    return props.rows[0]?.length ?? 0;
});

function handleDelimiterChange(value: string) {
    emit("update:delimiter", value as Delimiter);
}

function handleHasHeadersChange(value: boolean) {
    emit("update:hasHeaders", value);
}
</script>

<template>
    <div class="p-6">
        <div class="mx-auto max-w-4xl space-y-6">
            <div>
                <h2 class="text-lg font-semibold">{{ t("import.config.title") }}</h2>
                <p class="text-muted-foreground text-sm">{{ t("import.config.description") }}</p>
                <p v-if="fileName" class="text-muted-foreground mt-1 text-xs">
                    <Icon class="mr-1 inline h-3 w-3" name="iconoir:submit-document" />
                    {{ fileName }}
                </p>
            </div>

            <!-- Configuration -->
            <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                    <Label>{{ t("import.config.delimiter") }}</Label>
                    <Select :model-value="delimiter" @update:model-value="handleDelimiterChange">
                        <SelectTrigger>
                            <SelectValue :placeholder="t('import.config.selectDelimiter')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in delimiterOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="space-y-2">
                    <Label>{{ t("import.config.headers") }}</Label>
                    <div class="flex items-center gap-4 pt-2">
                        <Button
                            :variant="hasHeaders ? 'default' : 'outline'"
                            size="sm"
                            @click="handleHasHeadersChange(true)">
                            {{ t("common.yes") }}
                        </Button>
                        <Button
                            :variant="!hasHeaders ? 'default' : 'outline'"
                            size="sm"
                            @click="handleHasHeadersChange(false)">
                            {{ t("common.no") }}
                        </Button>
                    </div>
                </div>
            </div>

            <!-- Preview Table -->
            <div class="space-y-2">
                <h3 class="font-medium">{{ t("import.config.preview") }}</h3>
                <div class="overflow-auto rounded-lg border">
                    <Table>
                        <TableHeader v-if="headers">
                            <TableRow>
                                <TableHead class="w-12">#</TableHead>
                                <TableHead v-for="(header, index) in headers" :key="index" class="min-w-[120px]">
                                    {{ header || `Column ${index + 1}` }}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                                <TableCell class="text-muted-foreground w-12">
                                    {{ hasHeaders ? rowIndex + 2 : rowIndex + 1 }}
                                </TableCell>
                                <TableCell
                                    v-for="(cell, cellIndex) in row"
                                    :key="cellIndex"
                                    class="max-w-75 min-w-30 truncate">
                                    {{ cell }}
                                </TableCell>
                                <TableCell v-if="row.length < columnCount" :colspan="columnCount - row.length" />
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <p class="text-muted-foreground text-sm">
                    {{ t("import.config.previewRows", {count: previewRows.length}) }}
                </p>
            </div>

            <!-- Actions -->
            <div class="flex justify-end">
                <Button @click="emit('next')">
                    {{ t("import.actions.next") }}
                    <Icon class="ml-2 h-4 w-4" name="iconoir:arrow-right" />
                </Button>
            </div>
        </div>
    </div>
</template>
