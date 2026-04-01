<script lang="ts" setup>
import type {Delimiter} from "~/composables/useCsvParser";
import type {Account} from "~/stores/account.store";
import {cn} from "~/lib/utils";

const props = defineProps<{
    rows: string[][];
    delimiter: Delimiter;
    hasHeaders: boolean;
    fileName?: string;
    accounts: Account[];
    selectedAccountId: string | null;
    isLoadingAccounts: boolean;
}>();

const emit = defineEmits<{
    (e: "update:delimiter", delimiter: Delimiter): void;
    (e: "update:hasHeaders", value: boolean): void;
    (e: "update:accountId", accountId: string): void;
    (e: "next"): void;
}>();

const {t} = useI18n();

const delimiterOptions: {value: Delimiter; label: string}[] = [
    {value: ",", label: ", (comma)"},
    {value: ";", label: "; (semicolon)"},
    {value: "\t", label: "\\t (tab)"},
    {value: "|", label: "| (pipe)"},
];

const localSelectedAccountId = ref<string | null>(props.selectedAccountId);

// Sync with parent
watch(
    () => props.selectedAccountId,
    (newVal) => {
        localSelectedAccountId.value = newVal;
    },
);

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

const canProceed = computed(() => {
    return localSelectedAccountId.value !== null;
});

function handleDelimiterChange(value: string) {
    emit("update:delimiter", value as Delimiter);
}

function handleHasHeadersChange(value: boolean) {
    emit("update:hasHeaders", value);
}

function handleAccountSelect(accountId: string) {
    localSelectedAccountId.value = accountId;
    emit("update:accountId", accountId);
}

function handleNext() {
    if (canProceed.value) {
        emit("next");
    }
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

            <!-- Account Selection -->
            <div class="space-y-3">
                <Label class="text-base">{{ t("import.config.account") }}</Label>
                <p class="text-muted-foreground text-sm">{{ t("import.config.accountDescription") }}</p>

                <div v-if="isLoadingAccounts" class="flex items-center justify-center py-4">
                    <Icon name="iconoir:refresh" class="h-6 w-6 animate-spin" />
                </div>

                <div v-else-if="accounts.length === 0" class="text-muted-foreground py-4 text-center">
                    <p>{{ t("import.account.noAccounts") }}</p>
                    <NuxtLink to="/">
                        <Button class="mt-2" variant="outline" size="sm">
                            {{ t("import.account.createAccount") }}
                        </Button>
                    </NuxtLink>
                </div>

                <div v-else class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                        v-for="account in accounts"
                        :key="account.id"
                        type="button"
                        :class="
                            cn(
                                'hover:bg-muted flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                                localSelectedAccountId === account.id
                                    ? 'border-primary bg-primary/5 ring-primary ring-1'
                                    : 'border-border',
                            )
                        "
                        @click="handleAccountSelect(account.id)">
                        <div class="flex w-full items-center justify-between">
                            <span class="font-medium">{{ account.name }}</span>
                            <Icon
                                v-if="localSelectedAccountId === account.id"
                                name="iconoir:check-circle"
                                class="text-primary h-5 w-5" />
                        </div>
                        <span class="text-muted-foreground text-sm">{{ account.type }}</span>
                    </button>
                </div>
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
                <Button :disabled="!canProceed" @click="handleNext">
                    {{ t("import.actions.next") }}
                    <Icon class="ml-2 h-4 w-4" name="iconoir:arrow-right" />
                </Button>
            </div>
        </div>
    </div>
</template>
