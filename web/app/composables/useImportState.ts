import type {DateFormat, Delimiter, ParsedTransaction} from "./useCsvParser";

export type ImportStep = "upload" | "config" | "mapping" | "preview" | "result";

export interface ColumnMapping {
    date: number | null;
    dateFormat: DateFormat | null;
    description: number | null;
    amount: number | null; // For single-column amount mode
    credit: number | null; // For dual-column amount mode
    debit: number | null; // For dual-column amount mode
}

export interface FileConfig {
    delimiter: Delimiter;
    hasHeaders: boolean;
    encoding: "utf-8" | "latin1";
}

export interface ImportState {
    currentStep: ImportStep;
    rawRows: string[][]; // Raw CSV data for preview restoration
    fileName: string;
    fileConfig: FileConfig;
    mapping: ColumnMapping;
    transactions: ParsedTransaction[];
    lastModified: number;
}

const STORAGE_KEY_PREFIX = "flowy:import";

type LatestImportStateResult = {
    state: ImportState;
    accountId: string | null;
};

type StoredImportState = {
    accountId: string | null;
    state: ImportState;
};

function normalizeStoredState(stored: StoredImportState): StoredImportState {
    const storedDateFormat = stored.state.mapping?.dateFormat;
    const normalizedDateFormat = storedDateFormat && storedDateFormat !== "auto" ? storedDateFormat : null;

    return {
        ...stored,
        state: {
            ...stored.state,
            mapping: {
                date: stored.state.mapping?.date ?? null,
                dateFormat: normalizedDateFormat,
                description: stored.state.mapping?.description ?? null,
                amount: stored.state.mapping?.amount ?? null,
                credit: stored.state.mapping?.credit ?? null,
                debit: stored.state.mapping?.debit ?? null,
            },
        },
    };
}

export function useImportState() {
    const userStore = useUserStore();

    /**
     * Get single storage key for current user
     */
    function getStorageKey(): string {
        const userId = userStore.user?.id;
        if (!userId) return "";
        return `${STORAGE_KEY_PREFIX}:${userId}`;
    }

    /**
     * Save import state to localStorage
     */
    function saveState(accountId: string, state: ImportState): void {
        if (!process.client) return;

        const key = getStorageKey();
        if (!key) return;

        try {
            const stateToSave: ImportState = {
                ...state,
                lastModified: Date.now(),
            };
            const payload: StoredImportState = {
                accountId,
                state: stateToSave,
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (error) {
            console.error("Failed to save import state:", error);
        }
    }

    /**
     * Save temporary import state (before account is selected)
     */
    function saveTempState(state: ImportState): void {
        if (!process.client) return;

        const key = getStorageKey();
        if (!key) return;

        try {
            const stateToSave: ImportState = {
                ...state,
                lastModified: Date.now(),
            };
            const payload: StoredImportState = {
                accountId: null,
                state: stateToSave,
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (error) {
            console.error("Failed to save temp import state:", error);
        }
    }

    function loadStoredState(): StoredImportState | null {
        if (!process.client) return null;

        const key = getStorageKey();
        if (!key) return null;

        try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;

            return normalizeStoredState(JSON.parse(stored) as StoredImportState);
        } catch (error) {
            console.error("Failed to load stored import state:", error);
            return null;
        }
    }

    /**
     * Load import state from localStorage
     */
    function loadState(accountId: string): ImportState | null {
        const stored = loadStoredState();
        if (!stored) return null;
        return stored.accountId === accountId ? stored.state : null;
    }

    /**
     * Load temporary import state (before account is selected)
     */
    function loadTempState(): ImportState | null {
        const stored = loadStoredState();
        if (!stored) return null;
        return stored.accountId === null ? stored.state : null;
    }

    /**
     * Load most recent import state (temp or account-bound)
     */
    function loadLatestState(): LatestImportStateResult | null {
        const stored = loadStoredState();
        if (!stored) return null;
        return {
            state: stored.state,
            accountId: stored.accountId,
        };
    }

    /**
     * Clear import state from localStorage
     */
    function clearState(accountId: string): void {
        if (!process.client) return;

        const key = getStorageKey();
        if (!key) return;

        try {
            const stored = loadStoredState();
            if (stored?.accountId === accountId) {
                localStorage.removeItem(key);
            }
        } catch (error) {
            console.error("Failed to clear import state:", error);
        }
    }

    /**
     * Clear temporary import state
     */
    function clearTempState(): void {
        if (!process.client) return;

        const key = getStorageKey();
        if (!key) return;

        try {
            const stored = loadStoredState();
            if (stored?.accountId === null) {
                localStorage.removeItem(key);
            }
        } catch (error) {
            console.error("Failed to clear temp import state:", error);
        }
    }

    /**
     * Create default empty state
     */
    function createDefaultState(): ImportState {
        return {
            currentStep: "upload",
            rawRows: [],
            fileName: "",
            fileConfig: {
                delimiter: ",",
                hasHeaders: true,
                encoding: "utf-8",
            },
            mapping: {
                date: null,
                dateFormat: null,
                description: null,
                amount: null,
                credit: null,
                debit: null,
            },
            transactions: [],
            lastModified: Date.now(),
        };
    }

    /**
     * Update step in state
     */
    function updateStep(accountId: string | null, state: ImportState, step: ImportStep): ImportState {
        const newState: ImportState = {
            ...state,
            currentStep: step,
            lastModified: Date.now(),
        };
        if (accountId) {
            saveState(accountId, newState);
        } else {
            saveTempState(newState);
        }
        return newState;
    }

    /**
     * Update raw CSV data
     */
    function updateRawRows(
        accountId: string | null,
        state: ImportState,
        rawRows: string[][],
        fileName: string,
    ): ImportState {
        const newState: ImportState = {
            ...state,
            rawRows,
            fileName,
            lastModified: Date.now(),
        };
        if (accountId) {
            saveState(accountId, newState);
        } else {
            saveTempState(newState);
        }
        return newState;
    }

    /**
     * Update file config in state
     */
    function updateFileConfig(accountId: string | null, state: ImportState, config: Partial<FileConfig>): ImportState {
        const newState: ImportState = {
            ...state,
            fileConfig: {...state.fileConfig, ...config},
            lastModified: Date.now(),
        };
        if (accountId) {
            saveState(accountId, newState);
        } else {
            saveTempState(newState);
        }
        return newState;
    }

    /**
     * Update column mapping in state
     */
    function updateMapping(accountId: string | null, state: ImportState, mapping: Partial<ColumnMapping>): ImportState {
        const newState: ImportState = {
            ...state,
            mapping: {...state.mapping, ...mapping},
            lastModified: Date.now(),
        };
        if (accountId) {
            saveState(accountId, newState);
        } else {
            saveTempState(newState);
        }
        return newState;
    }

    /**
     * Update transactions in state
     */
    function updateTransactions(
        accountId: string | null,
        state: ImportState,
        transactions: ParsedTransaction[],
    ): ImportState {
        const newState: ImportState = {
            ...state,
            transactions,
            lastModified: Date.now(),
        };
        if (accountId) {
            saveState(accountId, newState);
        } else {
            saveTempState(newState);
        }
        return newState;
    }

    /**
     * Update single transaction
     */
    function updateTransaction(
        accountId: string | null,
        state: ImportState,
        transactionId: string,
        updates: Partial<ParsedTransaction>,
    ): ImportState {
        const transactions = state.transactions.map((tx) => (tx.id === transactionId ? {...tx, ...updates} : tx));
        return updateTransactions(accountId, state, transactions);
    }

    /**
     * Mark transaction as ignored
     */
    function ignoreTransaction(accountId: string | null, state: ImportState, transactionId: string): ImportState {
        return updateTransaction(accountId, state, transactionId, {status: "error", error: "ignored"});
    }

    /**
     * Mark transaction as pending (restore from ignored)
     */
    function restoreTransaction(accountId: string | null, state: ImportState, transactionId: string): ImportState {
        return updateTransaction(accountId, state, transactionId, {status: "pending", error: undefined});
    }

    /**
     * Update category/merchant assignment for transaction
     */
    function assignCategoryOrMerchant(
        accountId: string | null,
        state: ImportState,
        transactionId: string,
        updates: {categoryId?: string | null; merchantId?: string | null},
    ): ImportState {
        const transactions = state.transactions.map((tx) =>
            tx.id === transactionId
                ? {
                      ...tx,
                      categoryId: updates.categoryId ?? tx.categoryId,
                      merchantId: updates.merchantId ?? tx.merchantId,
                  }
                : tx,
        );
        return updateTransactions(accountId, state, transactions);
    }

    return {
        saveState,
        loadState,
        clearState,
        saveTempState,
        loadTempState,
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
    };
}
