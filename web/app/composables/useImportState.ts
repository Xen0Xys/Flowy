import type {Delimiter, ParsedTransaction} from "./useCsvParser";

export type ImportStep = "upload" | "config" | "mapping" | "preview" | "result";

export interface ColumnMapping {
    date: number | null;
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

export function useImportState() {
    const userStore = useUserStore();

    /**
     * Get storage key for current user and account
     */
    function getStorageKey(accountId: string): string {
        const userId = userStore.user?.id;
        if (!userId) return "";
        return `${STORAGE_KEY_PREFIX}:${userId}:${accountId}`;
    }

    /**
     * Save import state to localStorage
     */
    function saveState(accountId: string, state: ImportState): void {
        if (!process.client) return;

        const key = getStorageKey(accountId);
        if (!key) return;

        try {
            const stateToSave: ImportState = {
                ...state,
                lastModified: Date.now(),
            };
            localStorage.setItem(key, JSON.stringify(stateToSave));
        } catch (error) {
            console.error("Failed to save import state:", error);
        }
    }

    /**
     * Load import state from localStorage
     */
    function loadState(accountId: string): ImportState | null {
        if (!process.client) return null;

        const key = getStorageKey(accountId);
        if (!key) return null;

        try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;

            const state = JSON.parse(stored) as ImportState;
            return state;
        } catch (error) {
            console.error("Failed to load import state:", error);
            return null;
        }
    }

    /**
     * Clear import state from localStorage
     */
    function clearState(accountId: string): void {
        if (!process.client) return;

        const key = getStorageKey(accountId);
        if (!key) return;

        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error("Failed to clear import state:", error);
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
    function updateStep(accountId: string, state: ImportState, step: ImportStep): ImportState {
        const newState: ImportState = {
            ...state,
            currentStep: step,
            lastModified: Date.now(),
        };
        saveState(accountId, newState);
        return newState;
    }

    /**
     * Update raw CSV data
     */
    function updateRawRows(accountId: string, state: ImportState, rawRows: string[][], fileName: string): ImportState {
        const newState: ImportState = {
            ...state,
            rawRows,
            fileName,
            lastModified: Date.now(),
        };
        saveState(accountId, newState);
        return newState;
    }

    /**
     * Update file config in state
     */
    function updateFileConfig(accountId: string, state: ImportState, config: Partial<FileConfig>): ImportState {
        const newState: ImportState = {
            ...state,
            fileConfig: {...state.fileConfig, ...config},
            lastModified: Date.now(),
        };
        saveState(accountId, newState);
        return newState;
    }

    /**
     * Update column mapping in state
     */
    function updateMapping(accountId: string, state: ImportState, mapping: Partial<ColumnMapping>): ImportState {
        const newState: ImportState = {
            ...state,
            mapping: {...state.mapping, ...mapping},
            lastModified: Date.now(),
        };
        saveState(accountId, newState);
        return newState;
    }

    /**
     * Update transactions in state
     */
    function updateTransactions(accountId: string, state: ImportState, transactions: ParsedTransaction[]): ImportState {
        const newState: ImportState = {
            ...state,
            transactions,
            lastModified: Date.now(),
        };
        saveState(accountId, newState);
        return newState;
    }

    /**
     * Update single transaction
     */
    function updateTransaction(
        accountId: string,
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
    function ignoreTransaction(accountId: string, state: ImportState, transactionId: string): ImportState {
        return updateTransaction(accountId, state, transactionId, {status: "error", error: "ignored"});
    }

    /**
     * Mark transaction as pending (restore from ignored)
     */
    function restoreTransaction(accountId: string, state: ImportState, transactionId: string): ImportState {
        return updateTransaction(accountId, state, transactionId, {status: "pending", error: undefined});
    }

    /**
     * Update category/merchant assignment for transaction
     */
    function assignCategoryOrMerchant(
        accountId: string,
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
