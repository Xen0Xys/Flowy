export type Delimiter = "," | ";" | "\t" | "|";

export interface CsvParseResult {
    rows: string[][];
    headers: string[] | null;
    hasHeaders: boolean;
    delimiter: Delimiter;
    totalRows: number;
}

export interface ParsedTransaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    categoryId: string | null;
    merchantId: string | null;
    isRebalance: boolean;
    status: "pending" | "duplicate_internal" | "duplicate_db" | "will_import" | "error";
    error?: string;
    duplicateOf?: string;
}

export function useCsvParser() {
    const MAX_ROWS = 5000;

    /**
     * Parse amount from various formats
     * Supports: 1500, 15.50, 15,50, 1 500,00, 1.500,00, €15,50, (15,50)
     */
    function parseAmount(value: string): number | null {
        if (!value || value.trim() === "") return null;

        let cleaned = value.trim();

        // Parentheses = negative (accounting format)
        const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
        if (isNegative) {
            cleaned = cleaned.slice(1, -1);
        }

        // Remove currency symbols and spaces
        cleaned = cleaned.replace(/[€$£¥CHF]/gi, "").trim();

        // Remove thousands separators (spaces)
        cleaned = cleaned.replace(/\s+/g, "");

        // Detect decimal separator
        const lastComma = cleaned.lastIndexOf(",");
        const lastDot = cleaned.lastIndexOf(".");

        if (lastComma > lastDot) {
            // EU format: 1.234,56 or 1234,56
            cleaned = cleaned.replace(/\./g, "").replace(",", ".");
        } else if (lastDot > lastComma) {
            // US format: 1,234.56 or 1234.56
            cleaned = cleaned.replace(/,/g, "");
        }
        // If no separator found, it's an integer

        const amount = parseFloat(cleaned);

        if (isNaN(amount)) return null;

        return isNegative ? -amount : amount;
    }

    /**
     * Parse date from various formats
     * Supports: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, D/M/YYYY
     * Returns ISO-8601 DateTime format for Prisma compatibility
     */
    function parseDate(value: string): string | null {
        if (!value || value.trim() === "") return null;

        const cleaned = value.trim();

        // Helper to format as ISO-8601 DateTime
        const toISOString = (year: string, month: string, day: string): string => {
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
        };

        // Try ISO format first: YYYY-MM-DD
        const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (isoMatch) {
            return toISOString(isoMatch[1]!, isoMatch[2]!, isoMatch[3]!);
        }

        // Try DD/MM/YYYY or DD-MM-YYYY (EU format)
        const euMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (euMatch) {
            return toISOString(euMatch[3]!, euMatch[2]!, euMatch[1]!);
        }

        // Try MM/DD/YYYY (US format - ambiguous, assume EU if day > 12)
        const usMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (usMatch) {
            const first = parseInt(usMatch[1]!);
            const second = parseInt(usMatch[2]!);
            const year = usMatch[3]!;

            // If first > 12, it must be day (EU format)
            if (first > 12) {
                return toISOString(year, second.toString(), first.toString());
            }
            // If second > 12, it must be day (US format)
            if (second > 12) {
                return toISOString(year, first.toString(), second.toString());
            }
            // Ambiguous - assume EU format
            return toISOString(year, second.toString(), first.toString());
        }

        return null;
    }

    /**
     * Detect delimiter from content
     */
    function detectDelimiter(content: string): Delimiter {
        const firstLine = content.split("\n")[0] || content;
        const delimiters: Delimiter[] = [",", ";", "\t", "|"];
        let bestDelimiter: Delimiter = ",";
        let maxCount = 0;

        for (const delimiter of delimiters) {
            const count = (firstLine.match(new RegExp(escapeRegex(delimiter), "g")) || []).length;
            if (count > maxCount) {
                maxCount = count;
                bestDelimiter = delimiter;
            }
        }

        return bestDelimiter;
    }

    /**
     * Escape special regex characters
     */
    function escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /**
     * Parse CSV content into rows
     */
    function parseCsv(content: string, delimiter: Delimiter): string[][] {
        const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
        const rows: string[][] = [];

        for (const line of lines) {
            const row: string[] = [];
            let current = "";
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        // Escaped quote
                        current += '"';
                        i++;
                    } else {
                        // Toggle quote mode
                        inQuotes = !inQuotes;
                    }
                } else if (char === delimiter && !inQuotes) {
                    row.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }

            row.push(current.trim());
            rows.push(row);
        }

        return rows;
    }

    /**
     * Parse file and return structured result
     */
    async function parseFile(file: File): Promise<CsvParseResult> {
        return new Promise((resolve, reject) => {
            if (!file.name.toLowerCase().endsWith(".csv")) {
                reject(new Error("Only CSV files are supported"));
                return;
            }

            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const content = event.target?.result as string;
                    if (!content) {
                        reject(new Error("Failed to read file content"));
                        return;
                    }

                    const delimiter = detectDelimiter(content);
                    const rows = parseCsv(content, delimiter);

                    if (rows.length === 0) {
                        reject(new Error("File is empty"));
                        return;
                    }

                    if (rows.length > MAX_ROWS) {
                        reject(new Error(`File exceeds maximum of ${MAX_ROWS} rows`));
                        return;
                    }

                    // Detect if first row is headers
                    const hasHeaders = detectHeaders(rows[0] ?? []);

                    resolve({
                        rows,
                        headers: hasHeaders ? (rows[0] ?? null) : null,
                        hasHeaders,
                        delimiter,
                        totalRows: hasHeaders ? rows.length - 1 : rows.length,
                    });
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error("Failed to read file"));
            };

            reader.readAsText(file, "UTF-8");
        });
    }

    /**
     * Detect if first row contains headers
     */
    function detectHeaders(row: string[]): boolean {
        if (!row || row.length === 0) return false;
        // Check if first row looks like headers (no numeric values)
        const hasNumericValue = row.some((cell) => {
            const num = parseFloat(cell.replace(/[€$£¥,\s]/g, ""));
            return !isNaN(num) && isFinite(num);
        });

        return !hasNumericValue;
    }

    /**
     * Generate transaction signature for duplicate detection
     */
    function buildTransactionSignature(transaction: {date: string; description: string; amount: number}): string {
        return `${transaction.date}|${transaction.description.toLowerCase().trim()}|${transaction.amount}`;
    }

    /**
     * Detect internal duplicates within parsed transactions
     */
    function detectInternalDuplicates(transactions: ParsedTransaction[]): Map<string, string[]> {
        const signatureMap = new Map<string, string[]>();

        for (const tx of transactions) {
            const signature = buildTransactionSignature(tx);
            const existing = signatureMap.get(signature) || [];
            existing.push(tx.id);
            signatureMap.set(signature, existing);
        }

        // Only keep signatures with multiple transactions
        for (const [signature, ids] of signatureMap) {
            if (ids.length <= 1) {
                signatureMap.delete(signature);
            }
        }

        return signatureMap;
    }

    /**
     * Generate unique ID for local transactions
     */
    function generateId(): string {
        // Use crypto.randomUUID if available, fallback to timestamp + random
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID().slice(0, 10);
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    return {
        parseFile,
        parseAmount,
        parseDate,
        detectDelimiter,
        parseCsv,
        buildTransactionSignature,
        detectInternalDuplicates,
        generateId,
        MAX_ROWS,
    };
}
