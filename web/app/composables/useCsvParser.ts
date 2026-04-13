export type Delimiter = "," | ";" | "\t" | "|";

export type DateFormat =
    | "yyyymmdd"
    | "ddmmyyyy"
    | "mmddyyyy"
    | "yymmdd"
    | "yyyy-mm-dd"
    | "yyyy/mm/dd"
    | "yyyy.mm.dd"
    | "yy-mm-dd"
    | "yy/mm/dd"
    | "yy.mm.dd"
    | "dd/mm/yyyy"
    | "mm/dd/yyyy"
    | "dd/mm/yy"
    | "mm/dd/yy"
    | "dd-mm-yyyy"
    | "mm-dd-yyyy"
    | "dd-mm-yy"
    | "mm-dd-yy"
    | "dd.mm.yyyy"
    | "mm.dd.yyyy"
    | "dd.mm.yy"
    | "mm.dd.yy";

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
        cleaned = cleaned.replace(/(CHF|[€$£¥])/gi, "").trim();

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

    function normalizeTwoDigitYear(value: number): number {
        return value <= 69 ? 2000 + value : 1900 + value;
    }

    function detectDateFormat(value: string): DateFormat | null {
        if (!value || value.trim() === "") return null;

        const cleaned = value.trim();

        if (/^\d{8}$/.test(cleaned)) {
            const yearFirst = Number.parseInt(cleaned.slice(0, 4), 10);
            const yearLast = Number.parseInt(cleaned.slice(4), 10);
            const first = Number.parseInt(cleaned.slice(0, 2), 10);
            const second = Number.parseInt(cleaned.slice(2, 4), 10);

            if (yearFirst >= 1900 && yearFirst <= 2100) return "yyyymmdd";

            if (yearLast >= 1900 && yearLast <= 2100) {
                if (first > 12) return "ddmmyyyy";
                if (second > 12) return "mmddyyyy";
            }

            return null;
        }

        if (/^\d{6}$/.test(cleaned)) return "yymmdd";

        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) return "yyyy-mm-dd";
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleaned)) return "yyyy/mm/dd";
        if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(cleaned)) return "yyyy.mm.dd";
        if (/^\d{2}-\d{1,2}-\d{1,2}$/.test(cleaned)) return "yy-mm-dd";
        if (/^\d{2}\/\d{1,2}\/\d{1,2}$/.test(cleaned)) return "yy/mm/dd";
        if (/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(cleaned)) return "yy.mm.dd";

        const detectDayMonthOrder = (
            first: number,
            second: number,
            dayFirst: DateFormat,
            monthFirst: DateFormat,
        ): DateFormat | null => {
            if (first > 12) return dayFirst;
            if (second > 12) return monthFirst;
            return null;
        };

        const slash4 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slash4) {
            const first = Number.parseInt(slash4[1]!, 10);
            const second = Number.parseInt(slash4[2]!, 10);
            return detectDayMonthOrder(first, second, "dd/mm/yyyy", "mm/dd/yyyy");
        }

        const slash2 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
        if (slash2) {
            const first = Number.parseInt(slash2[1]!, 10);
            const second = Number.parseInt(slash2[2]!, 10);
            return detectDayMonthOrder(first, second, "dd/mm/yy", "mm/dd/yy");
        }

        const dash4 = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (dash4) {
            const first = Number.parseInt(dash4[1]!, 10);
            const second = Number.parseInt(dash4[2]!, 10);
            return detectDayMonthOrder(first, second, "dd-mm-yyyy", "mm-dd-yyyy");
        }

        const dash2 = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
        if (dash2) {
            const first = Number.parseInt(dash2[1]!, 10);
            const second = Number.parseInt(dash2[2]!, 10);
            return detectDayMonthOrder(first, second, "dd-mm-yy", "mm-dd-yy");
        }

        const dot4 = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (dot4) {
            const first = Number.parseInt(dot4[1]!, 10);
            const second = Number.parseInt(dot4[2]!, 10);
            return detectDayMonthOrder(first, second, "dd.mm.yyyy", "mm.dd.yyyy");
        }

        const dot2 = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
        if (dot2) {
            const first = Number.parseInt(dot2[1]!, 10);
            const second = Number.parseInt(dot2[2]!, 10);
            return detectDayMonthOrder(first, second, "dd.mm.yy", "mm.dd.yy");
        }

        return null;
    }

    /**
     * Parse date from common bank-export formats
     * Returns ISO-8601 DateTime format for Prisma compatibility
     */
    function parseDate(value: string, preferredFormat?: DateFormat): string | null {
        if (!value || value.trim() === "") return null;

        const cleaned = value.trim();

        const isValidDateParts = (year: number, month: number, day: number): boolean => {
            const y = year;
            const m = month;
            const d = day;

            if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
                return false;
            }

            if (m < 1 || m > 12 || d < 1 || d > 31) {
                return false;
            }

            const date = new Date(Date.UTC(y, m - 1, d));

            return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
        };

        // Helper to format as ISO-8601 DateTime
        const toISOString = (year: number, month: number, day: number): string => {
            if (!isValidDateParts(year, month, day)) {
                return "";
            }

            return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T00:00:00.000Z`;
        };

        const parseByFormat = (format: DateFormat): string | null => {
            if (format === "yyyymmdd") {
                const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[3]!, 10),
                    ) || null
                );
            }

            if (format === "ddmmyyyy") {
                const match = cleaned.match(/^(\d{2})(\d{2})(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[1]!, 10),
                    ) || null
                );
            }

            if (format === "mmddyyyy") {
                const match = cleaned.match(/^(\d{2})(\d{2})(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                    ) || null
                );
            }

            if (format === "yymmdd") {
                const match = cleaned.match(/^(\d{2})(\d{2})(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[1]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[3]!, 10)) || null;
            }

            if (format === "yyyy-mm-dd") {
                const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[3]!, 10),
                    ) || null
                );
            }

            if (format === "yyyy/mm/dd") {
                const match = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[3]!, 10),
                    ) || null
                );
            }

            if (format === "yyyy.mm.dd") {
                const match = cleaned.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[3]!, 10),
                    ) || null
                );
            }

            if (format === "yy-mm-dd") {
                const match = cleaned.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[1]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[3]!, 10)) || null;
            }

            if (format === "yy/mm/dd") {
                const match = cleaned.match(/^(\d{2})\/(\d{1,2})\/(\d{1,2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[1]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[3]!, 10)) || null;
            }

            if (format === "yy.mm.dd") {
                const match = cleaned.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[1]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[3]!, 10)) || null;
            }

            if (format === "dd/mm/yyyy") {
                const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[1]!, 10),
                    ) || null
                );
            }

            if (format === "dd/mm/yy") {
                const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[1]!, 10)) || null;
            }

            if (format === "mm/dd/yyyy") {
                const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                    ) || null
                );
            }

            if (format === "mm/dd/yy") {
                const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
                return toISOString(year, Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10)) || null;
            }

            if (format === "dd-mm-yyyy") {
                const match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[1]!, 10),
                    ) || null
                );
            }

            if (format === "mm-dd-yyyy") {
                const match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                    ) || null
                );
            }

            if (format === "dd-mm-yy") {
                const match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[1]!, 10)) || null;
            }

            if (format === "mm-dd-yy") {
                const match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
                return toISOString(year, Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10)) || null;
            }

            if (format === "dd.mm.yyyy") {
                const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[2]!, 10),
                        Number.parseInt(match[1]!, 10),
                    ) || null
                );
            }

            if (format === "mm.dd.yyyy") {
                const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (!match) return null;
                return (
                    toISOString(
                        Number.parseInt(match[3]!, 10),
                        Number.parseInt(match[1]!, 10),
                        Number.parseInt(match[2]!, 10),
                    ) || null
                );
            }

            if (format === "dd.mm.yy") {
                const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
                if (!match) return null;
                const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
                return toISOString(year, Number.parseInt(match[2]!, 10), Number.parseInt(match[1]!, 10)) || null;
            }

            const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
            if (!match) return null;
            const year = normalizeTwoDigitYear(Number.parseInt(match[3]!, 10));
            return toISOString(year, Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10)) || null;
        };

        if (preferredFormat) {
            return parseByFormat(preferredFormat);
        }

        const autoDetected = detectDateFormat(cleaned);
        if (autoDetected) {
            return parseByFormat(autoDetected);
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
        detectDateFormat,
        detectDelimiter,
        parseCsv,
        buildTransactionSignature,
        detectInternalDuplicates,
        generateId,
        MAX_ROWS,
    };
}
