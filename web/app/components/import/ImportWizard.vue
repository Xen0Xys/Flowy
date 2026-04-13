<script lang="ts" setup>
import type {CsvParseResult, DateFormat, Delimiter, ParsedTransaction} from "~/composables/useCsvParser";
import type {ColumnMapping, ImportState, ImportStep} from "~/composables/useImportState";
import type {CreateTransactionPayload} from "~/stores/transaction.store";
import {toast} from "vue-sonner";
import {cn} from "~/lib/utils";

const emit = defineEmits<{
    (e: "done"): void;
}>();

const {t} = useI18n();
const accountStore = useAccountStore();
const referenceStore = useReferenceStore();
const transactionStore = useTransactionStore();
const {parseFile, parseDate, parseAmount, generateId, detectInternalDuplicates, detectDateFormat} = useCsvParser();
const {
    loadState,
    clearState,
    loadLatestState,
    clearTempState,
    createDefaultState,
    updateStep,
    updateRawRows,
    updateFileConfig,
    updateMapping,
    updateTransactions,
    updateTransaction,
    ignoreTransaction,
    restoreTransaction,
    assignCategoryOrMerchant,
} = useImportState();

// Steps
type Step = "upload" | "config" | "mapping" | "preview" | "result";
const currentStep = ref<Step>("upload");

// Selected account
const selectedAccountId = ref<string | null>(null);
const isLoadingAccounts = ref(false);
const isInitializing = ref(true);

// State
const importState = ref<ImportState>(createDefaultState());
const isLoading = ref(false);
const isTesting = ref(false);
const isImporting = ref(false);
const importResult = ref<{insertedCount: number; duplicatesInDb: number} | null>(null);
const dbDuplicates = ref<ParsedTransaction[]>([]);

// Load accounts on mount
onMounted(async () => {
    isLoadingAccounts.value = true;
    try {
        await accountStore.fetchAccounts();
        await referenceStore.fetchReferences();

        const latest = loadLatestState();
        const hasData =
            latest &&
            ((latest.state.rawRows && latest.state.rawRows.length > 0) ||
                (latest.state.transactions && latest.state.transactions.length > 0));

        if (hasData && latest) {
            importState.value = latest.state;
            selectedAccountId.value = latest.accountId;

            const stepMap: Record<ImportStep, Step> = {
                upload: "upload",
                config: "config",
                mapping: "mapping",
                preview: "preview",
                result: "result",
            };

            currentStep.value = stepMap[latest.state.currentStep] || "config";
        }
    } catch (error) {
        console.error("Failed to load accounts:", error);
    } finally {
        isLoadingAccounts.value = false;
        isInitializing.value = false;
    }
});

// Handle account selection (called from ImportConfigStep)
function selectAccount(accountId: string) {
    selectedAccountId.value = accountId;

    // Check if current state has data (from temp state)
    const currentHasData = importState.value.rawRows.length > 0 || importState.value.transactions.length > 0;

    // Load saved state for this account
    const savedState = loadState(accountId);
    const savedHasData =
        savedState &&
        ((savedState.rawRows && savedState.rawRows.length > 0) ||
            (savedState.transactions && savedState.transactions.length > 0));

    if (currentHasData && !savedHasData) {
        // Transfer temp state to this account
        importState.value = updateStep(accountId, importState.value, importState.value.currentStep);
        clearTempState();
    } else if (savedHasData && savedState && savedState.currentStep) {
        // Load existing state for this account
        importState.value = savedState;
        const stepMap: Record<ImportStep, Step> = {
            upload: "upload",
            config: "config",
            mapping: "mapping",
            preview: "preview",
            result: "result",
        };
        currentStep.value = stepMap[savedState.currentStep] || "upload";
    }
}

// Save current step to state
function saveStep(step: Step) {
    currentStep.value = step;
    const stepMap: Record<Step, ImportStep> = {
        upload: "upload",
        config: "config",
        mapping: "mapping",
        preview: "preview",
        result: "result",
    };
    importState.value = updateStep(selectedAccountId.value, importState.value, stepMap[step]);
}

// File upload handler
async function handleFileUpload(file: File) {
    isLoading.value = true;

    try {
        const result: CsvParseResult = await parseFile(file);

        // Save raw rows and file name
        importState.value = updateRawRows(selectedAccountId.value, importState.value, result.rows, file.name);

        // Update file config
        importState.value = updateFileConfig(selectedAccountId.value, importState.value, {
            delimiter: result.delimiter,
            hasHeaders: result.hasHeaders,
        });

        saveStep("config");
    } catch (error: any) {
        toast.error(error.message || t("import.errors.fileRead"));
    } finally {
        isLoading.value = false;
    }
}

// Config step handlers
function updateDelimiter(delimiter: Delimiter) {
    importState.value = updateFileConfig(selectedAccountId.value, importState.value, {delimiter});
}

function updateHasHeaders(hasHeaders: boolean) {
    importState.value = updateFileConfig(selectedAccountId.value, importState.value, {hasHeaders});
}

// Mapping step handlers
function handleMappingUpdate(mapping: ColumnMapping) {
    const previousMapping = importState.value.mapping;
    let nextMapping = mapping;

    const dateColumnChanged = mapping.date !== previousMapping.date;
    const shouldAutoDetectDateFormat = dateColumnChanged && mapping.date !== null && mapping.dateFormat === null;

    if (shouldAutoDetectDateFormat) {
        const hasHeaders = importState.value.fileConfig.hasHeaders;
        const rows = hasHeaders ? importState.value.rawRows.slice(1) : importState.value.rawRows;

        let detectedFormat: DateFormat | null = null;
        for (const row of rows) {
            const value = row?.[mapping.date] ?? "";
            const format = detectDateFormat(value);
            if (format) {
                detectedFormat = format;
                break;
            }
        }

        nextMapping = {
            ...mapping,
            dateFormat: detectedFormat,
        };
    }

    importState.value = updateMapping(selectedAccountId.value, importState.value, nextMapping);
}

function applyMappingAndParse() {
    const mapping = importState.value.mapping;
    const hasHeaders = importState.value.fileConfig.hasHeaders;
    const dataRows = hasHeaders ? importState.value.rawRows.slice(1) : importState.value.rawRows;

    const transactions: ParsedTransaction[] = [];
    const errors: {row: number; error: string}[] = [];

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.every((cell) => !cell.trim())) continue;

        const rowIndex = hasHeaders ? i + 2 : i + 1;

        // Parse date
        const dateValue = mapping.date !== null ? (row[mapping.date] ?? "") : "";
        const date = parseDate(dateValue, mapping.dateFormat ?? undefined);
        if (!date) {
            errors.push({row: rowIndex, error: t("import.errors.invalidDate")});
            continue;
        }

        // Parse description
        const description = mapping.description !== null ? (row[mapping.description] ?? "").trim() : "";
        if (!description) {
            errors.push({row: rowIndex, error: t("import.errors.invalidDescription")});
            continue;
        }

        // Parse amount
        let amount: number | null = null;

        if (mapping.amount !== null) {
            amount = parseAmount(row[mapping.amount] ?? "");
        } else if (mapping.credit !== null || mapping.debit !== null) {
            const credit = mapping.credit !== null ? parseAmount(row[mapping.credit] ?? "") : null;
            const debit = mapping.debit !== null ? parseAmount(row[mapping.debit] ?? "") : null;

            if (credit !== null && debit !== null) {
                amount = credit - Math.abs(debit);
            } else if (credit !== null) {
                amount = credit;
            } else if (debit !== null) {
                amount = -Math.abs(debit);
            }
        }

        if (amount === null || amount === 0) {
            errors.push({row: rowIndex, error: t("import.errors.invalidAmount")});
            continue;
        }

        transactions.push({
            id: generateId(),
            date,
            description,
            amount,
            categoryId: null,
            merchantId: null,
            isRebalance: false,
            status: "pending",
        });
    }

    if (errors.length > 0) {
        toast.warning(t("import.warnings.rowsWithErrors", {count: errors.length}));
    }

    if (transactions.length === 0) {
        toast.error(t("import.errors.noValidTransactions"));
        return;
    }

    // Sort transactions by date descending (most recent first)
    transactions.sort((a, b) => b.date.localeCompare(a.date));

    // Detect internal duplicates
    const duplicateMap = detectInternalDuplicates(transactions);
    for (const [, ids] of duplicateMap) {
        for (let i = 1; i < ids.length; i++) {
            const tx = transactions.find((t) => t.id === ids[i]);
            if (tx) {
                tx.status = "duplicate_internal";
                tx.duplicateOf = ids[0];
            }
        }
    }

    importState.value = updateTransactions(selectedAccountId.value, importState.value, transactions);
    saveStep("preview");
}

// Preview step handlers
function handleIgnoreTransaction(transactionId: string) {
    importState.value = ignoreTransaction(selectedAccountId.value, importState.value, transactionId);
}

function handleRestoreTransaction(transactionId: string) {
    importState.value = restoreTransaction(selectedAccountId.value, importState.value, transactionId);
}

function handleAssignCategory(transactionId: string, categoryId: string | null) {
    importState.value = assignCategoryOrMerchant(selectedAccountId.value, importState.value, transactionId, {
        categoryId,
    });
}

function handleAssignMerchant(transactionId: string, merchantId: string | null) {
    importState.value = assignCategoryOrMerchant(selectedAccountId.value, importState.value, transactionId, {
        merchantId,
    });
}

async function handleTestDb() {
    if (!selectedAccountId.value) {
        toast.error(t("import.config.selectAccount"));
        return;
    }

    isTesting.value = true;
    dbDuplicates.value = [];

    try {
        const activeTransactions = importState.value.transactions.filter((tx) => tx.status !== "error");

        const payload: CreateTransactionPayload[] = activeTransactions.map((tx) => ({
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            categoryId: tx.categoryId ?? undefined,
            merchantId: tx.merchantId ?? undefined,
            isRebalance: tx.isRebalance,
        }));

        const result = await transactionStore.testBulkTransactions(selectedAccountId.value, payload);

        const toKey = (tx: {date: string; description: string; amount: number}) =>
            JSON.stringify([tx.date, tx.description, tx.amount]);

        const duplicateKeySet = new Set(result.duplicates.map((dup) => toKey(dup)));

        const nextTransactions = importState.value.transactions.map((tx) => {
            if (tx.status === "error" || tx.status === "duplicate_internal") {
                return tx;
            }

            const nextStatus = duplicateKeySet.has(toKey(tx)) ? "duplicate_db" : "will_import";

            if (tx.status === nextStatus) {
                return tx;
            }

            return {
                ...tx,
                status: nextStatus,
            };
        });

        importState.value = updateTransactions(selectedAccountId.value, importState.value, nextTransactions as any);

        toast.success(t("import.success.testComplete", {count: result.wouldInsertCount}));
    } catch (error: any) {
        toast.error(error.message || t("import.errors.testFailed"));
    } finally {
        isTesting.value = false;
    }
}

async function handleImport() {
    if (!selectedAccountId.value) {
        toast.error(t("import.config.selectAccount"));
        return;
    }

    isImporting.value = true;

    try {
        const payload: CreateTransactionPayload[] = importState.value.transactions
            // Import every active row unless user explicitly ignored it
            .filter((tx) => tx.status !== "error")
            .map((tx) => ({
                amount: tx.amount,
                description: tx.description,
                date: tx.date,
                categoryId: tx.categoryId ?? undefined,
                merchantId: tx.merchantId ?? undefined,
                isRebalance: tx.isRebalance,
            }));

        const result = await transactionStore.createBulkTransactions(selectedAccountId.value, payload);

        importResult.value = {
            insertedCount: result.insertedCount,
            duplicatesInDb: result.duplicates.length,
        };

        clearState(selectedAccountId.value);
        currentStep.value = "result";
    } catch (error: any) {
        toast.error(error.message || t("import.errors.importFailed"));
    } finally {
        isImporting.value = false;
    }
}

function handleReset() {
    importState.value = createDefaultState();
    dbDuplicates.value = [];
    importResult.value = null;
    if (selectedAccountId.value) {
        clearState(selectedAccountId.value);
    } else {
        clearTempState();
    }
    currentStep.value = "upload";
}

function handleFullReset() {
    handleReset();
    selectedAccountId.value = null;
}

function handleDone() {
    emit("done");
}

// Navigation
function goBack() {
    switch (currentStep.value) {
        case "config":
            currentStep.value = "upload";
            break;
        case "mapping":
            currentStep.value = "config";
            break;
        case "preview":
            currentStep.value = "mapping";
            break;
    }
}

const canGoBack = computed(() => {
    return ["config", "mapping", "preview"].includes(currentStep.value);
});

// Duplicate groups
const internalDuplicateGroups = computed(() => {
    return detectInternalDuplicates(importState.value.transactions.filter((tx) => tx.status !== "error"));
});

// Statistics
const stats = computed(() => {
    const total = importState.value.transactions.length;
    const pending = importState.value.transactions.filter((tx) => tx.status === "pending").length;
    const duplicates = importState.value.transactions.filter((tx) => tx.status === "duplicate_internal").length;
    const dbDups = importState.value.transactions.filter((tx) => tx.status === "duplicate_db").length;
    const willImport = importState.value.transactions.filter((tx) => tx.status !== "error").length;
    const errors = importState.value.transactions.filter((tx) => tx.status === "error").length;

    return {total, pending, duplicates, dbDups, willImport, errors};
});
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- Header -->
        <div class="border-b px-6 py-4">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-xl font-semibold">{{ t("import.title") }}</h1>
                    <p class="text-muted-foreground text-sm">{{ t("import.subtitle") }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <Button v-if="canGoBack && !isInitializing" variant="ghost" @click="goBack">
                        <Icon class="mr-2 h-4 w-4" name="iconoir:arrow-left" />
                        {{ t("common.back") }}
                    </Button>
                    <Button v-if="currentStep !== 'result' && !isInitializing" variant="outline" @click="handleReset">
                        {{ t("import.actions.reset") }}
                    </Button>
                </div>
            </div>

            <!-- Progress indicator (hidden during initialization) -->
            <div v-if="!isInitializing" class="mt-4 flex items-center gap-2">
                <template v-for="(step, index) in ['upload', 'config', 'mapping', 'preview'] as Step[]" :key="step">
                    <div
                        :class="
                            cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                                currentStep === step || (currentStep === 'result' && index <= 3)
                                    ? 'bg-primary text-primary-foreground'
                                    : (['upload', 'config', 'mapping', 'preview'] as string[]).indexOf(currentStep) >
                                        index
                                      ? 'bg-primary/20 text-primary'
                                      : 'bg-muted text-muted-foreground',
                            )
                        ">
                        {{ index + 1 }}
                    </div>
                    <div v-if="index < 3" class="bg-muted h-0.5 w-8" />
                </template>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto">
            <!-- Loading state during initialization -->
            <div v-if="isInitializing" class="flex h-full items-center justify-center">
                <Icon class="h-8 w-8 animate-spin" name="iconoir:refresh" />
            </div>

            <!-- Upload Step -->
            <ImportFileUploadStep
                v-else-if="currentStep === 'upload'"
                :is-loading="isLoading"
                @upload="handleFileUpload" />

            <!-- Config Step -->
            <ImportConfigStep
                v-else-if="currentStep === 'config'"
                :accounts="accountStore.accounts"
                :delimiter="importState.fileConfig.delimiter"
                :file-name="importState.fileName"
                :has-headers="importState.fileConfig.hasHeaders"
                :is-loading-accounts="isLoadingAccounts"
                :rows="importState.rawRows"
                :selected-account-id="selectedAccountId"
                @next="saveStep('mapping')"
                @update:delimiter="updateDelimiter"
                @update:hasHeaders="updateHasHeaders"
                @update:accountId="selectAccount" />

            <!-- Mapping Step -->
            <ImportMappingStep
                v-else-if="currentStep === 'mapping'"
                :has-headers="importState.fileConfig.hasHeaders"
                :mapping="importState.mapping"
                :rows="importState.rawRows"
                @parse="applyMappingAndParse"
                @update:mapping="handleMappingUpdate" />

            <!-- Preview Step -->
            <ImportPreviewStep
                v-else-if="currentStep === 'preview'"
                :duplicate-groups="internalDuplicateGroups"
                :is-importing="isImporting"
                :is-testing="isTesting"
                :stats="stats"
                :transactions="importState.transactions"
                @ignore="handleIgnoreTransaction"
                @import="handleImport"
                @restore="handleRestoreTransaction"
                @test="handleTestDb"
                @assign-category="handleAssignCategory"
                @assign-merchant="handleAssignMerchant" />

            <!-- Result Step -->
            <ImportResultStep
                v-else-if="currentStep === 'result'"
                :result="importResult"
                @done="handleDone"
                @reset="handleFullReset" />
        </div>
    </div>
</template>
