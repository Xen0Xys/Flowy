import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import {Cron} from "@nestjs/schedule";
import {PrismaService} from "../../helper/prisma.service";
import {computeNextRunAt} from "./recurring-transaction.utils";
import {RecurringTransactions} from "../../../../prisma/generated/client";

const FAILURE_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;
const STARTUP_CATCHUP_MAX_ITERATIONS = 100;

@Injectable()
export class RecurringTransactionTask implements OnModuleInit {
    private readonly logger = new Logger(RecurringTransactionTask.name);
    private isProcessing = false;

    constructor(private readonly prismaService: PrismaService) {}

    async onModuleInit(): Promise<void> {
        this.logger.log("Startup catch-up: processing due recurring transactions");
        const summary = await this.runGuarded(() => this.processAllDueUntilCaughtUp());
        if (summary) {
            this.logger.log(`Startup catch-up complete: processed=${summary.processed} failed=${summary.failed}`);
        }
    }

    @Cron("5 * * * *")
    async runDue(): Promise<void> {
        await this.runGuarded(() => this.processDueRecurrences(new Date()));
    }

    async processAllDueUntilCaughtUp(): Promise<{processed: number; failed: number}> {
        let totalProcessed = 0;
        let totalFailed = 0;
        for (let i = 0; i < STARTUP_CATCHUP_MAX_ITERATIONS; i++) {
            // oxlint-disable-next-line no-await-in-loop
            const {processed, failed} = await this.processDueRecurrences(new Date());
            totalProcessed += processed;
            totalFailed += failed;
            if (processed === 0 && failed === 0) break;
        }
        return {processed: totalProcessed, failed: totalFailed};
    }

    async processDueRecurrences(now: Date): Promise<{processed: number; failed: number}> {
        const due = await this.prismaService.recurringTransactions.findMany({
            where: {next_run_at: {lte: now}},
        });

        let processed = 0;
        let failed = 0;

        // Sequential processing is intentional: keeps DB lock windows small
        // and prevents a batch failure from cascading across recurrences.
        for (const rt of due) {
            try {
                // oxlint-disable-next-line no-await-in-loop
                await this.processOne(rt, now);
                processed += 1;
            } catch (err) {
                failed += 1;
                this.logger.error(
                    `Failed to process recurring transaction ${rt.id}: ${err instanceof Error ? err.message : String(err)}`,
                );
                // oxlint-disable-next-line no-await-in-loop
                await this.recordFailure(rt, err);
            }
        }

        if (processed > 0 || failed > 0) {
            this.logger.log(`Recurring scheduler tick: processed=${processed} failed=${failed}`);
        }
        return {processed, failed};
    }

    private async runGuarded<T>(fn: () => Promise<T>): Promise<T | null> {
        if (this.isProcessing) {
            this.logger.warn("Skipping recurring tick: previous run still in progress");
            return null;
        }
        this.isProcessing = true;
        try {
            return await fn();
        } finally {
            this.isProcessing = false;
        }
    }

    private async processOne(rt: RecurringTransactions, now: Date): Promise<void> {
        const scheduled = rt.next_run_at;

        await this.prismaService.$transaction(async (tx) => {
            if (rt.is_enabled) {
                const account = await tx.accounts.findUnique({where: {id: rt.account_id}});
                if (!account || account.user_id !== rt.user_id) {
                    throw new Error("Account not found or ownership mismatch");
                }

                const created = await tx.transactions.create({
                    data: {
                        account_id: rt.account_id,
                        amount: rt.amount,
                        description: rt.name,
                        date: scheduled,
                        merchant_id: rt.merchant_id,
                        category_id: rt.category_id,
                        is_rebalance: false,
                        in_budget: rt.in_budget,
                    },
                });

                await tx.accounts.update({
                    where: {id: rt.account_id},
                    data: {balance: {increment: rt.amount}},
                });

                await tx.recurringTransactionExecutions.create({
                    data: {
                        recurring_transaction_id: rt.id,
                        transaction_id: created.id,
                        status: "CREATED",
                        scheduled_for: scheduled,
                    },
                });
            } else {
                await tx.recurringTransactionExecutions.create({
                    data: {
                        recurring_transaction_id: rt.id,
                        status: "SKIPPED",
                        scheduled_for: scheduled,
                    },
                });
            }

            const nextRunAt = computeNextRunAt(
                {
                    frequency: rt.frequency,
                    day_of_month: rt.day_of_month,
                    day_of_week: rt.day_of_week,
                    month_of_year: rt.month_of_year,
                    timezone: rt.timezone,
                },
                scheduled,
            );

            await tx.recurringTransactions.update({
                where: {id: rt.id},
                data: {
                    next_run_at: nextRunAt,
                    last_run_at: now,
                    last_failure_at: null,
                },
            });
        });
    }

    private async recordFailure(rt: RecurringTransactions, err: unknown): Promise<void> {
        const now = new Date();
        const shouldCreateLog =
            rt.last_failure_at === null || now.getTime() - rt.last_failure_at.getTime() > FAILURE_DEDUP_WINDOW_MS;
        const errorMessage = err instanceof Error ? err.message : String(err);

        try {
            await this.prismaService.$transaction(async (tx) => {
                if (shouldCreateLog) {
                    await tx.recurringTransactionExecutions.create({
                        data: {
                            recurring_transaction_id: rt.id,
                            status: "FAILED",
                            error_message: errorMessage,
                            scheduled_for: rt.next_run_at,
                        },
                    });
                }
                await tx.recurringTransactions.update({
                    where: {id: rt.id},
                    data: {last_failure_at: now},
                });
            });
        } catch (writeErr) {
            this.logger.error(
                `Failed to record failure for recurring ${rt.id}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
            );
        }
    }
}
