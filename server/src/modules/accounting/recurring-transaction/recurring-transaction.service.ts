import {BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {CreateRecurringTransactionDto} from "./models/dto/create-recurring-transaction.dto";
import {UpdateRecurringTransactionDto} from "./models/dto/update-recurring-transaction.dto";
import {ListRecurringTransactionsDto} from "./models/dto/list-recurring-transactions.dto";
import {ListExecutionsDto} from "./models/dto/list-executions.dto";
import {CalendarQueryDto} from "./models/dto/calendar-query.dto";
import {RecurringTransactionEntity} from "./models/entities/recurring-transaction.entity";
import {
    ListExecutionsResultEntity,
    RecurringTransactionExecutionEntity,
} from "./models/entities/recurring-transaction-execution.entity";
import {RecurringCalendarEntity, RecurringCalendarOccurrenceEntity} from "./models/entities/recurring-calendar.entity";
import {MerchantEntity} from "../reference/models/entities/merchant.entity";
import {CategoryEntity} from "../reference/models/entities/category.entity";
import {Prisma, RecurringTransactions} from "../../../../prisma/generated/client";
import {computeNextRunAt, enumerateOccurrencesInMonth, isValidTimezone} from "./recurring-transaction.utils";

type RecurringWithRelations = Prisma.RecurringTransactionsGetPayload<{
    include: {merchant: true; category: true};
}>;

const FAILURE_WINDOW_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RecurringTransactionService {
    private readonly logger = new Logger(RecurringTransactionService.name);

    constructor(private readonly prismaService: PrismaService) {}

    async list(user: UserEntity, filters: ListRecurringTransactionsDto): Promise<RecurringTransactionEntity[]> {
        const where: Prisma.RecurringTransactionsWhereInput = {user_id: user.id};
        if (filters.accountId) where.account_id = filters.accountId;
        if (filters.enabled === "true") where.is_enabled = true;
        else if (filters.enabled === "false") where.is_enabled = false;

        const items = await this.prismaService.recurringTransactions.findMany({
            where,
            include: {merchant: true, category: true},
            orderBy: [{next_run_at: "asc"}],
        });

        return items.map((rt) => this.toEntity(rt));
    }

    async getById(user: UserEntity, id: string): Promise<RecurringTransactionEntity> {
        const rt = await this.getOwnedOrThrow(user, id);
        return this.toEntity(rt);
    }

    async create(
        user: UserEntity,
        accountId: string,
        dto: CreateRecurringTransactionDto,
    ): Promise<RecurringTransactionEntity> {
        await this.getOwnedAccountOrThrow(user, accountId);
        await this.validateReferencesOwnership(user, dto.merchantId, dto.categoryId);
        this.validateFrequencyDayCombination(dto);
        this.validateTimezone(dto.timezone);

        const initialAnchor = new Date(Date.now() - 1);
        const nextRunAt = computeNextRunAt(
            {
                frequency: dto.frequency,
                day_of_month: dto.dayOfMonth ?? null,
                day_of_week: dto.dayOfWeek ?? null,
                month_of_year: dto.monthOfYear ?? null,
                timezone: dto.timezone,
            },
            initialAnchor,
        );

        const created = await this.prismaService.recurringTransactions.create({
            data: {
                user_id: user.id,
                account_id: accountId,
                name: dto.name,
                amount: this.toDecimal(dto.amount),
                merchant_id: dto.merchantId ?? null,
                category_id: dto.categoryId ?? null,
                frequency: dto.frequency,
                day_of_month: dto.dayOfMonth ?? null,
                day_of_week: dto.dayOfWeek ?? null,
                month_of_year: dto.monthOfYear ?? null,
                timezone: dto.timezone,
                in_budget: dto.inBudget,
                is_enabled: dto.isEnabled ?? true,
                next_run_at: nextRunAt,
            },
            include: {merchant: true, category: true},
        });

        return this.toEntity(created);
    }

    async update(user: UserEntity, id: string, dto: UpdateRecurringTransactionDto): Promise<RecurringTransactionEntity> {
        const rt = await this.getOwnedOrThrow(user, id);

        if (dto.merchantId !== undefined || dto.categoryId !== undefined) {
            await this.validateReferencesOwnership(user, dto.merchantId ?? undefined, dto.categoryId ?? undefined);
        }
        if (dto.timezone !== undefined) this.validateTimezone(dto.timezone);

        const merged = {
            frequency: dto.frequency ?? rt.frequency,
            day_of_month: dto.dayOfMonth !== undefined ? dto.dayOfMonth : rt.day_of_month,
            day_of_week: dto.dayOfWeek !== undefined ? dto.dayOfWeek : rt.day_of_week,
            month_of_year: dto.monthOfYear !== undefined ? dto.monthOfYear : rt.month_of_year,
            timezone: dto.timezone ?? rt.timezone,
        };
        this.validateFrequencyDayCombination({
            frequency: merged.frequency,
            dayOfMonth: merged.day_of_month ?? undefined,
            dayOfWeek: merged.day_of_week ?? undefined,
            monthOfYear: merged.month_of_year ?? undefined,
        });

        const schedulingChanged =
            dto.frequency !== undefined ||
            dto.dayOfMonth !== undefined ||
            dto.dayOfWeek !== undefined ||
            dto.monthOfYear !== undefined ||
            dto.timezone !== undefined;

        const data: Prisma.RecurringTransactionsUncheckedUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.amount !== undefined) data.amount = this.toDecimal(dto.amount);
        if (dto.merchantId !== undefined) data.merchant_id = dto.merchantId;
        if (dto.categoryId !== undefined) data.category_id = dto.categoryId;
        if (dto.frequency !== undefined) data.frequency = dto.frequency;
        if (dto.dayOfMonth !== undefined) data.day_of_month = dto.dayOfMonth;
        if (dto.dayOfWeek !== undefined) data.day_of_week = dto.dayOfWeek;
        if (dto.monthOfYear !== undefined) data.month_of_year = dto.monthOfYear;
        if (dto.timezone !== undefined) data.timezone = dto.timezone;
        if (dto.inBudget !== undefined) data.in_budget = dto.inBudget;
        if (dto.isEnabled !== undefined) data.is_enabled = dto.isEnabled;

        if (schedulingChanged) {
            const anchor = new Date(Date.now() - 1);
            data.next_run_at = computeNextRunAt(
                {
                    frequency: merged.frequency,
                    day_of_month: merged.day_of_month,
                    day_of_week: merged.day_of_week,
                    month_of_year: merged.month_of_year,
                    timezone: merged.timezone,
                },
                anchor,
            );
            data.last_failure_at = null;
        }

        const updated = await this.prismaService.recurringTransactions.update({
            where: {id},
            data,
            include: {merchant: true, category: true},
        });

        return this.toEntity(updated);
    }

    async delete(user: UserEntity, id: string): Promise<void> {
        await this.getOwnedOrThrow(user, id);
        await this.prismaService.recurringTransactions.delete({where: {id}});
    }

    async toggle(user: UserEntity, id: string, isEnabled: boolean): Promise<RecurringTransactionEntity> {
        await this.getOwnedOrThrow(user, id);
        const updated = await this.prismaService.recurringTransactions.update({
            where: {id},
            data: {is_enabled: isEnabled},
            include: {merchant: true, category: true},
        });
        return this.toEntity(updated);
    }

    async listExecutions(user: UserEntity, id: string, query: ListExecutionsDto): Promise<ListExecutionsResultEntity> {
        await this.getOwnedOrThrow(user, id);

        const [total, items] = await this.prismaService.$transaction([
            this.prismaService.recurringTransactionExecutions.count({where: {recurring_transaction_id: id}}),
            this.prismaService.recurringTransactionExecutions.findMany({
                where: {recurring_transaction_id: id},
                orderBy: [{executed_at: "desc"}],
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
        ]);

        return new ListExecutionsResultEntity({
            items: items.map(
                (execution) =>
                    new RecurringTransactionExecutionEntity({
                        id: execution.id,
                        recurringTransactionId: execution.recurring_transaction_id,
                        transactionId: execution.transaction_id,
                        status: execution.status,
                        errorMessage: execution.error_message,
                        scheduledFor: execution.scheduled_for,
                        executedAt: execution.executed_at,
                    }),
            ),
            total,
            page: query.page,
            pageSize: query.pageSize,
            totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        });
    }

    async getCalendar(user: UserEntity, query: CalendarQueryDto): Promise<RecurringCalendarEntity> {
        const items = await this.prismaService.recurringTransactions.findMany({
            where: {user_id: user.id},
            include: {merchant: true, category: true},
        });

        const occurrences: RecurringCalendarOccurrenceEntity[] = [];
        for (const rt of items) {
            const dates = enumerateOccurrencesInMonth(
                {
                    frequency: rt.frequency,
                    day_of_month: rt.day_of_month,
                    day_of_week: rt.day_of_week,
                    month_of_year: rt.month_of_year,
                    timezone: rt.timezone,
                },
                query.year,
                query.month,
            );
            for (const date of dates) {
                occurrences.push(
                    new RecurringCalendarOccurrenceEntity({
                        recurringTransactionId: rt.id,
                        scheduledFor: date,
                        localDate: this.formatLocalDate(date, rt.timezone),
                    }),
                );
            }
        }

        return new RecurringCalendarEntity({
            year: query.year,
            month: query.month,
            occurrences,
            recurringTransactions: items.map((rt) => this.toEntity(rt)),
        });
    }

    async getPlannedByCategoryForMonth(
        user: UserEntity,
        year: number,
        month: number,
        tx?: TxClient,
    ): Promise<Map<string | null, number>> {
        const prisma = this.prismaService.withTx(tx);

        const accountIds = await prisma.accounts
            .findMany({where: {user_id: user.id, in_budget: true}, select: {id: true}})
            .then((accs) => accs.map((a) => a.id));
        if (accountIds.length === 0) return new Map();

        const items = await prisma.recurringTransactions.findMany({
            where: {user_id: user.id, in_budget: true, is_enabled: true, account_id: {in: accountIds}},
        });
        if (items.length === 0) return new Map();

        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEndExclusive = new Date(Date.UTC(year, month, 1));

        const ids = items.map((rt) => rt.id);
        const executed = await prisma.recurringTransactionExecutions.findMany({
            where: {
                recurring_transaction_id: {in: ids},
                scheduled_for: {gte: monthStart, lt: monthEndExclusive},
            },
            select: {recurring_transaction_id: true, scheduled_for: true},
        });
        const executedKey = new Set(
            executed.map(
                (execution) => `${execution.recurring_transaction_id}|${execution.scheduled_for.toISOString()}`,
            ),
        );

        const plannedByCategory = new Map<string | null, number>();
        for (const rt of items) {
            if (rt.amount >= 0) continue;
            const occurrences = enumerateOccurrencesInMonth(
                {
                    frequency: rt.frequency,
                    day_of_month: rt.day_of_month,
                    day_of_week: rt.day_of_week,
                    month_of_year: rt.month_of_year,
                    timezone: rt.timezone,
                },
                year,
                month,
            );
            const now = new Date();
            for (const date of occurrences) {
                if (date.getTime() < now.getTime()) continue;
                const key = `${rt.id}|${date.toISOString()}`;
                if (executedKey.has(key)) continue;
                const amount = Math.abs(rt.amount);
                const catKey = rt.category_id;
                plannedByCategory.set(catKey, this.toDecimal((plannedByCategory.get(catKey) ?? 0) + amount));
            }
        }
        return plannedByCategory;
    }

    private toEntity(rt: RecurringWithRelations): RecurringTransactionEntity {
        const isFailing = rt.last_failure_at !== null && Date.now() - rt.last_failure_at.getTime() < FAILURE_WINDOW_MS;

        return new RecurringTransactionEntity({
            id: rt.id,
            userId: rt.user_id,
            accountId: rt.account_id,
            name: rt.name,
            amount: rt.amount,
            merchant: rt.merchant
                ? new MerchantEntity({
                      id: rt.merchant.id,
                      userId: rt.merchant.user_id,
                      name: rt.merchant.name,
                      keywords: rt.merchant.keywords,
                      primaryKeyword: rt.merchant.primary_keyword,
                      autoCompleteEnabled: rt.merchant.auto_complete_enabled,
                      createdAt: rt.merchant.created_at,
                      updatedAt: rt.merchant.updated_at,
                  })
                : undefined,
            category: rt.category
                ? new CategoryEntity({
                      id: rt.category.id,
                      userId: rt.category.user_id,
                      name: rt.category.name,
                      hexColor: rt.category.hex_color,
                      icon: rt.category.icon,
                      keywords: rt.category.keywords,
                      primaryKeyword: rt.category.primary_keyword,
                      autoCompleteEnabled: rt.category.auto_complete_enabled,
                      createdAt: rt.category.created_at,
                      updatedAt: rt.category.updated_at,
                  })
                : undefined,
            frequency: rt.frequency,
            dayOfMonth: rt.day_of_month,
            dayOfWeek: rt.day_of_week,
            monthOfYear: rt.month_of_year,
            timezone: rt.timezone,
            inBudget: rt.in_budget,
            isEnabled: rt.is_enabled,
            nextRunAt: rt.next_run_at,
            lastRunAt: rt.last_run_at,
            lastFailureAt: rt.last_failure_at,
            isFailing,
            createdAt: rt.created_at,
            updatedAt: rt.updated_at,
        });
    }

    private async getOwnedOrThrow(user: UserEntity, id: string): Promise<RecurringWithRelations> {
        const rt = await this.prismaService.recurringTransactions.findUnique({
            where: {id},
            include: {merchant: true, category: true},
        });
        if (!rt) throw new NotFoundException("Recurring transaction not found");
        if (rt.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this recurring transaction");
        }
        return rt;
    }

    private async getOwnedAccountOrThrow(user: UserEntity, accountId: string): Promise<void> {
        const account = await this.prismaService.accounts.findUnique({where: {id: accountId}});
        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this account");
        }
    }

    private async validateReferencesOwnership(
        user: UserEntity,
        merchantId?: string | null,
        categoryId?: string | null,
    ): Promise<void> {
        if (merchantId) {
            const merchant = await this.prismaService.userMerchants.findUnique({where: {id: merchantId}});
            if (!merchant || merchant.user_id !== user.id) throw new NotFoundException("Merchant not found");
        }
        if (categoryId) {
            const category = await this.prismaService.userCategories.findUnique({where: {id: categoryId}});
            if (!category || category.user_id !== user.id) throw new NotFoundException("Category not found");
        }
    }

    private validateFrequencyDayCombination(dto: {
        frequency: RecurringTransactions["frequency"];
        dayOfMonth?: number | null;
        dayOfWeek?: number | null;
        monthOfYear?: number | null;
    }): void {
        if (dto.frequency === "WEEKLY") {
            if (dto.dayOfWeek === null || dto.dayOfWeek === undefined) {
                throw new BadRequestException("dayOfWeek is required for WEEKLY frequency");
            }
            return;
        }
        if (dto.dayOfMonth === null || dto.dayOfMonth === undefined) {
            throw new BadRequestException("dayOfMonth is required for monthly-based frequencies");
        }
        if (dto.frequency === "MONTHLY") return;
        if (dto.monthOfYear === null || dto.monthOfYear === undefined) {
            throw new BadRequestException(
                "monthOfYear is required for BIMONTHLY, QUARTERLY, SEMIANNUAL and YEARLY frequencies",
            );
        }
    }

    private validateTimezone(tz: string): void {
        if (!isValidTimezone(tz)) throw new BadRequestException(`Invalid timezone: ${tz}`);
    }

    private toDecimal(nb: number): number {
        return Math.round(nb * 100) / 100;
    }

    private formatLocalDate(date: Date, tz: string): string {
        const dtf = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        return dtf.format(date);
    }
}
