<script lang="ts" setup>
import type {CsvParseResult, Delimiter, ParsedTransaction} from "~/composables/useCsvParser";
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
const {parseFile, parseDate, generateId, detectInternalDuplicates} = useCsvParser();
const {
    loadState,
    clearState,
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
type Step = "account" | "upload" | "config" | "mapping" | "preview" | "result";
const currentStep = ref<Step>("account");

// Selected account
const selectedAccountId = ref<string | null>(null);
const isLoadingAccounts = ref(false);

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
    } catch (error) {
        console.error("Failed to load accounts:", error);
    } finally {
        isLoadingAccounts.value = false;
    }
});

// Get selected account
const selectedAccount = computed(() => {
    if (!selectedAccountId.value) return null;
    return accountStore.accounts.find((a) => a.id === selectedAccountId.value);
});

// Handle account selection
function selectAccount(accountId: string) {
    selectedAccountId.value = accountId;

    // Load saved state for this account
    const savedState = loadState(accountId);
    const hasData =
        savedState &&
        ((savedState.rawRows && savedState.rawRows.length > 0) ||
            (savedState.transactions && savedState.transactions.length > 0));

    if (hasData && savedState && savedState.currentStep) {
        importState.value = savedState;
        // Restore step from saved state (convert from ImportStep to Step)
        const stepMap: Record<ImportStep, Step> = {
            upload: "upload",
            config: "config",
            mapping: "mapping",
            preview: "preview",
            result: "result",
        };
        currentStep.value = stepMap[savedState.currentStep] || "upload";
    } else {
        importState.value = createDefaultState();
        currentStep.value = "upload";
    }
}

// Save current step to state
function saveStep(step: Step) {
    currentStep.value = step;
    if (selectedAccountId.value) {
        const stepMap: Record<Step, ImportStep> = {
            account: "upload",
            upload: "upload",
            config: "config",
            mapping: "mapping",
            preview: "preview",
            result: "result",
        };
        importState.value = updateStep(selectedAccountId.value, importState.value, stepMap[step]);
    }
}

// File upload handler
async function handleFileUpload(file: File) {
    isLoading.value = true;

    try {
        const result: CsvParseResult = await parseFile(file);

        // Save raw rows and file name
        importState.value = updateRawRows(selectedAccountId.value!, importState.value, result.rows, file.name);

        // Update file config
        importState.value = updateFileConfig(selectedAccountId.value!, importState.value, {
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
    importState.value = updateFileConfig(selectedAccountId.value!, importState.value, {delimiter});
}

function updateHasHeaders(hasHeaders: boolean) {
    importState.value = updateFileConfig(selectedAccountId.value!, importState.value, {hasHeaders});
}

// Mapping step handlers
function handleMappingUpdate(mapping: ColumnMapping) {
    importState.value = updateMapping(selectedAccountId.value!, importState.value, mapping);
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
        const date = parseDate(dateValue);
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
            const {parseAmount} = useCsvParser();
            amount = parseAmount(row[mapping.amount] ?? "");
        } else if (mapping.credit !== null || mapping.debit !== null) {
            const {parseAmount} = useCsvParser();
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

    importState.value = updateTransactions(selectedAccountId.value!, importState.value, transactions);
    saveStep("preview");
}

// Preview step handlers
function handleIgnoreTransaction(transactionId: string) {
    importState.value = ignoreTransaction(selectedAccountId.value!, importState.value, transactionId);
}

function handleRestoreTransaction(transactionId: string) {
    importState.value = restoreTransaction(selectedAccountId.value!, importState.value, transactionId);
}

function handleAssignCategory(transactionId: string, categoryId: string | null) {
    importState.value = assignCategoryOrMerchant(selectedAccountId.value!, importState.value, transactionId, {
        categoryId,
    });
}

function handleAssignMerchant(transactionId: string, merchantId: string | null) {
    importState.value = assignCategoryOrMerchant(selectedAccountId.value!, importState.value, transactionId, {
        merchantId,
    });
}

async function handleTestDb() {
    if (!selectedAccountId.value) return;

    isTesting.value = true;
    dbDuplicates.value = [];

    try {
        const payload: CreateTransactionPayload[] = importState.value.transactions
            .filter((tx) => tx.status !== "error")
            .map((tx) => ({
                amount: tx.amount,
                description: tx.description,
                date: tx.date,
                categoryId: tx.categoryId ?? undefined,
                merchantId: tx.merchantId ?? undefined,
                isRebalance: tx.isRebalance,
            }));

        const result = await transactionStore.testBulkTransactions(selectedAccountId.value, payload);

        // Mark DB duplicates
        for (const dup of result.duplicates) {
            const tx = importState.value.transactions.find(
                (t) => t.date === dup.date && t.description === dup.description && t.amount === dup.amount,
            );
            if (tx && tx.status !== "error" && tx.status !== "duplicate_internal") {
                importState.value = updateTransaction(selectedAccountId.value!, importState.value, tx.id, {
                    status: "duplicate_db",
                });
            }
        }

        // Mark non-duplicates as will_import
        for (const tx of importState.value.transactions) {
            if (tx.status === "pending" || tx.status === "will_import") {
                const isDup = result.duplicates.some(
                    (d) => d.date === tx.date && d.description === tx.description && d.amount === tx.amount,
                );
                if (!isDup) {
                    importState.value = updateTransaction(selectedAccountId.value!, importState.value, tx.id, {
                        status: "will_import",
                    });
                }
            }
        }

        toast.success(t("import.success.testComplete", {count: result.wouldInsertCount}));
    } catch (error: any) {
        toast.error(error.message || t("import.errors.testFailed"));
    } finally {
        isTesting.value = false;
    }
}

async function handleImport() {
    if (!selectedAccountId.value) return;

    isImporting.value = true;

    try {
        const payload: CreateTransactionPayload[] = importState.value.transactions
            .filter((tx) => tx.status === "will_import")
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
    }
    currentStep.value = "upload";
}

function handleFullReset() {
    handleReset();
    selectedAccountId.value = null;
    currentStep.value = "account";
}

function handleDone() {
    emit("done");
}

// Navigation
function goBack() {
    switch (currentStep.value) {
        case "upload":
            currentStep.value = "account";
            break;
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
    return ["upload", "config", "mapping", "preview"].includes(currentStep.value);
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
    const willImport = importState.value.transactions.filter((tx) => tx.status === "will_import").length;
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
                    <Button v-if="canGoBack" variant="ghost" @click="goBack">
                        <Icon name="iconoir:arrow-left" class="mr-2 h-4 w-4" />
                        {{ t("common.back") }}
                    </Button>
                    <Button
                        v-if="currentStep !== 'account' && currentStep !== 'result'"
                        variant="outline"
                        @click="handleReset">
                        {{ t("import.actions.reset") }}
                    </Button>
                </div>
            </div>

            <!-- Progress indicator (hidden on account step) -->
            <div v-if="currentStep !== 'account'" class="mt-4 flex items-center gap-2">
                <template v-for="(step, index) in ['upload', 'config', 'mapping', 'preview'] as Step[]" :key="step">
                    <div
                        :class="
                            cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                                currentStep === step || (currentStep === 'result' && index <= 3)
                                    ? 'bg-primary text-primary-foreground'
                                    : ['config', 'mapping', 'preview', 'result'].indexOf(currentStep) > index
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
            <!-- Account Selection Step -->
            <div v-if="currentStep === 'account'" class="flex h-full items-center justify-center p-6">
                <div class="w-full max-w-md">
                    <h2 class="mb-2 text-lg font-semibold">{{ t("import.account.title") }}</h2>
                    <p class="text-muted-foreground mb-6 text-sm">{{ t("import.account.description") }}</p>

                    <div v-if="isLoadingAccounts" class="flex items-center justify-center py-8">
                        <Icon name="iconoir:refresh" class="h-8 w-8 animate-spin" />
                    </div>

                    <div v-else-if="accountStore.accounts.length === 0" class="text-muted-foreground py-8 text-center">
                        <p>{{ t("import.account.noAccounts") }}</p>
                        <NuxtLink to="/">
                            <Button class="mt-4" variant="outline">
                                {{ t("import.account.createAccount") }}
                            </Button>
                        </NuxtLink>
                    </div>

                    <div v-else class="space-y-2">
                        <button
                            v-for="account in accountStore.accounts"
                            :key="account.id"
                            type="button"
                            :class="
                                cn(
                                    'hover:bg-muted flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors',
                                    selectedAccountId === account.id && 'border-primary bg-primary/5',
                                )
                            "
                            @click="selectAccount(account.id)">
                            <div>
                                <div class="font-medium">{{ account.name }}</div>
                                <div class="text-muted-foreground text-sm">{{ account.type }}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-medium">
                                    {{ account.balance.toFixed(2) }}
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Upload Step -->
            <ImportFileUploadStep
                v-else-if="currentStep === 'upload'"
                :is-loading="isLoading"
                @upload="handleFileUpload" />

            <!-- Config Step -->
            <ImportConfigStep
                v-else-if="currentStep === 'config'"
                :rows="importState.rawRows"
                :delimiter="importState.fileConfig.delimiter"
                :has-headers="importState.fileConfig.hasHeaders"
                :file-name="importState.fileName"
                @update:delimiter="updateDelimiter"
                @update:hasHeaders="updateHasHeaders"
                @next="saveStep('mapping')" />

            <!-- Mapping Step -->
            <ImportMappingStep
                v-else-if="currentStep === 'mapping'"
                :rows="importState.rawRows"
                :has-headers="importState.fileConfig.hasHeaders"
                :mapping="importState.mapping"
                @update:mapping="handleMappingUpdate"
                @parse="applyMappingAndParse" />

            <!-- Preview Step -->
            <ImportPreviewStep
                v-else-if="currentStep === 'preview'"
                :transactions="importState.transactions"
                :duplicate-groups="internalDuplicateGroups"
                :stats="stats"
                :is-testing="isTesting"
                :is-importing="isImporting"
                @ignore="handleIgnoreTransaction"
                @restore="handleRestoreTransaction"
                @assign-category="handleAssignCategory"
                @assign-merchant="handleAssignMerchant"
                @test="handleTestDb"
                @import="handleImport" />

            <!-- Result Step -->
            <ImportResultStep
                v-else-if="currentStep === 'result'"
                :result="importResult"
                @reset="handleFullReset"
                @done="handleDone" />
        </div>
    </div>
</template>
