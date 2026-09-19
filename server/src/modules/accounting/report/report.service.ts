import {BadRequestException, Injectable, Logger} from "@nestjs/common";
import {PrismaService} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {AccountAccessService} from "../account/account-access.service";
import {AccountService} from "../account/account.service";
import {ReportFiltersDto, TopMerchantsDto} from "./models/dto/report-filters.dto";
import {ReportKpiEntity, ReportKpiPeriodEntity} from "./models/entities/report-kpi.entity";
import {CashFlowPointEntity} from "./models/entities/cash-flow.entity";
import {
    CategoryBreakdownEntity,
    CategoryTrendCategoryEntity,
    CategoryTrendEntity,
    CategoryTrendPointEntity,
} from "./models/entities/category-breakdown.entity";
import {MerchantBreakdownEntity} from "./models/entities/merchant-breakdown.entity";
import {AccountBreakdownEntity} from "./models/entities/account-breakdown.entity";
import {NetWorthPointEntity} from "./models/entities/net-worth.entity";
import {BudgetVsActualPointEntity} from "./models/entities/budget-vs-actual.entity";
import {
    CashFlowSankeyEntity,
    CashFlowSankeyLinkEntity,
    CashFlowSankeyNodeEntity,
} from "./models/entities/cash-flow-sankey.entity";
import {Prisma} from "../../../../prisma/generated/client";

const UNCATEGORIZED_COLOR = "#94a3b8";
const UNCATEGORIZED_ICON = "iconoir:question-mark";

@Injectable()
export class ReportService {
    private readonly logger = new Logger(ReportService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly accountAccess: AccountAccessService,
        private readonly accountService: AccountService,
    ) {}

    async getKpis(user: UserEntity, filters: ReportFiltersDto): Promise<ReportKpiEntity> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);
        const rangeMs = end.getTime() - start.getTime();
        const previousStart = new Date(start.getTime() - rangeMs);
        const previousEnd = new Date(start.getTime() - 1);

        if (scopedIds.length === 0) {
            const empty = new ReportKpiPeriodEntity({
                income: 0,
                expense: 0,
                net: 0,
                savingsRate: 0,
                transactionCount: 0,
            });
            return new ReportKpiEntity({current: empty, previous: empty});
        }

        const [current, previous] = await Promise.all([
            this.computeKpisForRange(scopedIds, start, end, filters),
            this.computeKpisForRange(scopedIds, previousStart, previousEnd, filters),
        ]);

        return new ReportKpiEntity({current, previous});
    }

    async getCashFlow(user: UserEntity, filters: ReportFiltersDto): Promise<CashFlowPointEntity[]> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return [];

        const whereSql = this.buildTransactionScopeSql(scopedIds, start, end, filters);
        const rows = await this.prismaService.$queryRaw<{period: Date; income: number | null; expense: number | null}[]>`
            SELECT
                date_trunc('month', "date") AS period,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::float AS income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0)::float AS expense
            FROM transactions
            WHERE ${whereSql}
            GROUP BY period
            ORDER BY period ASC
        `;

        return this.fillCashFlowGaps(rows, start, end);
    }

    async getCashFlowSankey(user: UserEntity, filters: ReportFiltersDto): Promise<CashFlowSankeyEntity> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        const empty = new CashFlowSankeyEntity({
            nodes: [],
            links: [],
            totals: {income: 0, expense: 0, net: 0},
        });

        if (scopedIds.length === 0) return empty;

        const [incomeGrouped, expenseGrouped] = await Promise.all([
            this.prismaService.transactions.groupBy({
                by: ["category_id"],
                where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {gt: 0}}),
                _sum: {amount: true},
            }),
            this.prismaService.transactions.groupBy({
                by: ["category_id"],
                where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {lt: 0}}),
                _sum: {amount: true},
            }),
        ]);

        const categoryIds = [
            ...new Set(
                [...incomeGrouped, ...expenseGrouped]
                    .map((g) => g.category_id)
                    .filter((id): id is string => id !== null),
            ),
        ];
        const categories = categoryIds.length
            ? await this.prismaService.userCategories.findMany({
                  where: {id: {in: categoryIds}},
                  select: {id: true, name: true, hex_color: true, icon: true},
              })
            : [];
        const categoryMap = new Map(categories.map((c) => [c.id, c]));

        const round2 = (v: number) => Math.round(v * 100) / 100;

        const incomeItems = incomeGrouped
            .map((g) => ({
                categoryId: g.category_id,
                amount: round2(g._sum.amount ?? 0),
            }))
            .filter((i) => i.amount > 0)
            .sort((a, b) => b.amount - a.amount);

        const expenseItems = expenseGrouped
            .map((g) => ({
                categoryId: g.category_id,
                amount: round2(Math.abs(g._sum.amount ?? 0)),
            }))
            .filter((i) => i.amount > 0)
            .sort((a, b) => b.amount - a.amount);

        const totalIncome = round2(incomeItems.reduce((sum, i) => sum + i.amount, 0));
        const totalExpense = round2(expenseItems.reduce((sum, i) => sum + i.amount, 0));
        const net = round2(totalIncome - totalExpense);

        if (totalIncome === 0 && totalExpense === 0) return empty;

        const nodes: CashFlowSankeyNodeEntity[] = [];
        const links: CashFlowSankeyLinkEntity[] = [];

        const revenueId = "__revenue__";
        const spendingId = "__spending__";
        const savingsId = "__savings__";
        const deficitId = "__deficit__";

        for (const item of incomeItems) {
            const key = item.categoryId ?? "__uncategorized_income__";
            const cat = item.categoryId ? categoryMap.get(item.categoryId) : undefined;
            nodes.push(
                new CashFlowSankeyNodeEntity({
                    id: `in:${key}`,
                    label: cat?.name ?? "",
                    kind: "income",
                    hexColor: cat?.hex_color ?? UNCATEGORIZED_COLOR,
                    icon: cat?.icon ?? UNCATEGORIZED_ICON,
                }),
            );
            links.push(
                new CashFlowSankeyLinkEntity({
                    source: `in:${key}`,
                    target: revenueId,
                    value: item.amount,
                }),
            );
        }

        if (totalIncome > 0) {
            nodes.push(new CashFlowSankeyNodeEntity({id: revenueId, label: "", kind: "hub"}));
        }

        if (totalExpense > 0) {
            nodes.push(new CashFlowSankeyNodeEntity({id: spendingId, label: "", kind: "hub"}));

            const fromRevenue = Math.min(totalIncome, totalExpense);
            if (fromRevenue > 0) {
                links.push(
                    new CashFlowSankeyLinkEntity({
                        source: revenueId,
                        target: spendingId,
                        value: round2(fromRevenue),
                    }),
                );
            }
        }

        if (net > 0) {
            nodes.push(new CashFlowSankeyNodeEntity({id: savingsId, label: "", kind: "savings"}));
            links.push(
                new CashFlowSankeyLinkEntity({
                    source: revenueId,
                    target: savingsId,
                    value: round2(net),
                }),
            );
        } else if (net < 0 && totalExpense > 0) {
            nodes.push(new CashFlowSankeyNodeEntity({id: deficitId, label: "", kind: "deficit"}));
            links.push(
                new CashFlowSankeyLinkEntity({
                    source: deficitId,
                    target: spendingId,
                    value: round2(Math.abs(net)),
                }),
            );
        }

        for (const item of expenseItems) {
            const key = item.categoryId ?? "__uncategorized_expense__";
            const cat = item.categoryId ? categoryMap.get(item.categoryId) : undefined;
            nodes.push(
                new CashFlowSankeyNodeEntity({
                    id: `out:${key}`,
                    label: cat?.name ?? "",
                    kind: "expense",
                    hexColor: cat?.hex_color ?? UNCATEGORIZED_COLOR,
                    icon: cat?.icon ?? UNCATEGORIZED_ICON,
                }),
            );
            links.push(
                new CashFlowSankeyLinkEntity({
                    source: spendingId,
                    target: `out:${key}`,
                    value: item.amount,
                }),
            );
        }

        return new CashFlowSankeyEntity({
            nodes,
            links,
            totals: {income: totalIncome, expense: totalExpense, net},
        });
    }

    async getByCategory(user: UserEntity, filters: ReportFiltersDto): Promise<CategoryBreakdownEntity[]> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return [];

        const grouped = await this.prismaService.transactions.groupBy({
            by: ["category_id"],
            where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {lt: 0}}),
            _sum: {amount: true},
            _count: {_all: true},
        });

        const categoryIds = grouped.map((g) => g.category_id).filter((id): id is string => id !== null);
        const categories = categoryIds.length
            ? await this.prismaService.userCategories.findMany({
                  where: {id: {in: categoryIds}},
                  select: {id: true, name: true, hex_color: true, icon: true},
              })
            : [];
        const categoryMap = new Map(categories.map((c) => [c.id, c]));

        const result: CategoryBreakdownEntity[] = grouped.map((g) => {
            const spent = Math.round(Math.abs(g._sum.amount ?? 0) * 100) / 100;
            if (g.category_id === null) {
                return new CategoryBreakdownEntity({
                    categoryId: null,
                    name: "",
                    hexColor: UNCATEGORIZED_COLOR,
                    icon: UNCATEGORIZED_ICON,
                    spent,
                    count: g._count._all,
                });
            }
            const cat = categoryMap.get(g.category_id);
            return new CategoryBreakdownEntity({
                categoryId: g.category_id,
                name: cat?.name ?? "",
                hexColor: cat?.hex_color ?? UNCATEGORIZED_COLOR,
                icon: cat?.icon ?? UNCATEGORIZED_ICON,
                spent,
                count: g._count._all,
            });
        });

        result.sort((a, b) => b.spent - a.spent);
        return result;
    }

    async getCategoryTrend(user: UserEntity, filters: ReportFiltersDto): Promise<CategoryTrendEntity> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return new CategoryTrendEntity({categories: [], points: []});

        const whereSql = this.buildTransactionScopeSql(scopedIds, start, end, filters, Prisma.sql`amount < 0`);
        const rows = await this.prismaService.$queryRaw<
            {period: Date; category_id: string | null; spent: number | null}[]
        >`
            SELECT
                date_trunc('month', "date") AS period,
                category_id,
                COALESCE(SUM(ABS(amount)), 0)::float AS spent
            FROM transactions
            WHERE ${whereSql}
            GROUP BY period, category_id
            ORDER BY period ASC
        `;

        const categoryIds = [...new Set(rows.map((r) => r.category_id).filter((id): id is string => id !== null))];
        const categories = categoryIds.length
            ? await this.prismaService.userCategories.findMany({
                  where: {id: {in: categoryIds}},
                  select: {id: true, name: true, hex_color: true, icon: true},
              })
            : [];
        const categoryMap = new Map(categories.map((c) => [c.id, c]));

        const totalsByCat = new Map<string, number>();
        for (const row of rows) {
            const key = row.category_id ?? "__uncategorized__";
            totalsByCat.set(key, (totalsByCat.get(key) ?? 0) + (row.spent ?? 0));
        }

        const categoriesOut: CategoryTrendCategoryEntity[] = [];
        for (const [key, total] of totalsByCat.entries()) {
            if (key === "__uncategorized__") {
                categoriesOut.push(
                    new CategoryTrendCategoryEntity({
                        categoryId: null,
                        name: "",
                        hexColor: UNCATEGORIZED_COLOR,
                        icon: UNCATEGORIZED_ICON,
                        total: Math.round(total * 100) / 100,
                    }),
                );
            } else {
                const cat = categoryMap.get(key);
                categoriesOut.push(
                    new CategoryTrendCategoryEntity({
                        categoryId: key,
                        name: cat?.name ?? "",
                        hexColor: cat?.hex_color ?? UNCATEGORIZED_COLOR,
                        icon: cat?.icon ?? UNCATEGORIZED_ICON,
                        total: Math.round(total * 100) / 100,
                    }),
                );
            }
        }
        categoriesOut.sort((a, b) => b.total - a.total);

        const monthKeys = this.buildMonthKeys(start, end);
        const pointMap = new Map<string, CategoryTrendPointEntity>();
        for (const key of monthKeys) {
            pointMap.set(key, new CategoryTrendPointEntity({period: key, spentByCategoryId: {}}));
        }

        for (const row of rows) {
            const periodKey = row.period.toISOString().slice(0, 10);
            const point = pointMap.get(periodKey);
            if (!point) continue;
            const catKey = row.category_id ?? "__uncategorized__";
            const rounded = Math.round((row.spent ?? 0) * 100) / 100;
            point.spentByCategoryId[catKey] = (point.spentByCategoryId[catKey] ?? 0) + rounded;
        }

        return new CategoryTrendEntity({categories: categoriesOut, points: [...pointMap.values()]});
    }

    async getByMerchant(user: UserEntity, filters: TopMerchantsDto): Promise<MerchantBreakdownEntity[]> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);
        const limit = filters.limit ?? 10;

        if (scopedIds.length === 0) return [];

        const grouped = await this.prismaService.transactions.groupBy({
            by: ["merchant_id"],
            where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {lt: 0}}),
            _sum: {amount: true},
            _count: {_all: true},
        });

        const merchantIds = grouped.map((g) => g.merchant_id).filter((id): id is string => id !== null);
        const merchants = merchantIds.length
            ? await this.prismaService.userMerchants.findMany({
                  where: {id: {in: merchantIds}},
                  select: {id: true, name: true},
              })
            : [];
        const merchantMap = new Map(merchants.map((m) => [m.id, m.name]));

        const result: MerchantBreakdownEntity[] = grouped.map((g) => {
            const spent = Math.round(Math.abs(g._sum.amount ?? 0) * 100) / 100;
            if (g.merchant_id === null) {
                return new MerchantBreakdownEntity({
                    merchantId: null,
                    name: "",
                    spent,
                    count: g._count._all,
                });
            }
            return new MerchantBreakdownEntity({
                merchantId: g.merchant_id,
                name: merchantMap.get(g.merchant_id) ?? "",
                spent,
                count: g._count._all,
            });
        });

        result.sort((a, b) => b.spent - a.spent);
        return result.slice(0, limit);
    }

    async getByAccount(user: UserEntity, filters: ReportFiltersDto): Promise<AccountBreakdownEntity[]> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return [];

        const [accounts, incomeGrouped, expenseGrouped] = await Promise.all([
            this.prismaService.accounts.findMany({
                where: {id: {in: scopedIds}},
                include: {user: {select: {id: true, username: true}}},
            }),
            this.prismaService.transactions.groupBy({
                by: ["account_id"],
                where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {gt: 0}}),
                _sum: {amount: true},
            }),
            this.prismaService.transactions.groupBy({
                by: ["account_id"],
                where: this.buildTransactionScope(scopedIds, start, end, filters, {amount: {lt: 0}}),
                _sum: {amount: true},
            }),
        ]);

        const incomeMap = new Map(incomeGrouped.map((g) => [g.account_id, g._sum.amount ?? 0]));
        const expenseMap = new Map(expenseGrouped.map((g) => [g.account_id, g._sum.amount ?? 0]));

        const accessMap = await this.accountAccess.getAccessMap(user, scopedIds);

        const result: AccountBreakdownEntity[] = accounts.map((account) => {
            const income = Math.round((incomeMap.get(account.id) ?? 0) * 100) / 100;
            const expense = Math.round(Math.abs(expenseMap.get(account.id) ?? 0) * 100) / 100;
            return new AccountBreakdownEntity({
                accountId: account.id,
                name: account.name,
                type: account.type,
                ownerId: account.user_id,
                ownerUsername: account.user.username,
                access: accessMap.get(account.id) ?? "read",
                balance: Math.round(account.balance * 100) / 100,
                income,
                expense,
            });
        });

        result.sort((a, b) => b.expense + b.income - (a.expense + a.income));
        return result;
    }

    async getNetWorth(user: UserEntity, filters: ReportFiltersDto): Promise<NetWorthPointEntity[]> {
        const {scoped: scopedIds} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return [];

        const accounts = await this.prismaService.accounts.findMany({
            where: {id: {in: scopedIds}},
            select: {id: true, type: true},
        });
        const typeById = new Map(accounts.map((a) => [a.id, a.type as string]));

        const evolutionSeries = await Promise.all(
            scopedIds.map((id) =>
                this.accountService.getAccountBalanceEvolution(user, id, start.toISOString(), end.toISOString(), {
                    skipAccessCheck: true,
                    resolution: "month",
                }),
            ),
        );

        const pointMap = new Map<string, NetWorthPointEntity>();

        for (let i = 0; i < scopedIds.length; i++) {
            const accountId = scopedIds[i];
            const series = evolutionSeries[i];
            const accountType = typeById.get(accountId) ?? "OTHER";

            for (const point of series) {
                const dateKey = point.date.toISOString().slice(0, 10);
                let entry = pointMap.get(dateKey);
                if (!entry) {
                    entry = new NetWorthPointEntity({date: dateKey, total: 0, byType: {}});
                    pointMap.set(dateKey, entry);
                }
                entry.total += point.balance;
                entry.byType[accountType] = (entry.byType[accountType] ?? 0) + point.balance;
            }
        }

        const sorted = [...pointMap.values()].sort((a, b) => a.date.localeCompare(b.date));
        for (const point of sorted) {
            point.total = Math.round(point.total * 100) / 100;
            for (const [key, value] of Object.entries(point.byType)) {
                point.byType[key] = Math.round(value * 100) / 100;
            }
        }
        return sorted;
    }

    async getBudgetVsActual(user: UserEntity, filters: ReportFiltersDto): Promise<BudgetVsActualPointEntity[]> {
        const {scoped: scopedIds, readable} = await this.resolveAccountIds(user, filters);
        const {start, end} = this.parseRange(filters);

        if (scopedIds.length === 0) return [];

        const months = this.buildMonthEntries(start, end);

        const budgets = await this.prismaService.budgets.findMany({
            where: {
                OR: months.map(({year, month}) => ({year, month})),
                accounts: {some: {account_id: {in: scopedIds}}},
            },
            include: {
                budgeted_categories: true,
                accounts: {select: {account_id: true}},
            },
        });

        const budgetsByPeriod = new Map<string, typeof budgets>();
        for (const budget of budgets) {
            // Only include budgets whose every member account is readable by
            // the user (regardless of the current accountIds filter). This
            // preserves the budget when the user narrows the report to a
            // subset of the budget's accounts.
            const allReadable = budget.accounts.every((a) => readable.has(a.account_id));
            if (!allReadable) continue;
            const key = `${budget.year}-${budget.month}`;
            if (!budgetsByPeriod.has(key)) budgetsByPeriod.set(key, []);
            budgetsByPeriod.get(key)!.push(budget);
        }

        // Budget vs Actual intrinsically compares against `in_budget=true`
        // transactions, so we ignore the caller's `budgeted` filter here.
        // Other filters (transfers, categories, merchants, rebalances) still
        // apply to keep the comparison consistent with the rest of the page.
        const actualFilters: ReportFiltersDto = {...filters, budgeted: "budgeted"};

        const monthPromises = months.map(async ({year, month}) => {
            const key = `${year}-${month}`;
            const monthBudgets = budgetsByPeriod.get(key) ?? [];

            const monthStart = new Date(Date.UTC(year, month - 1, 1));
            const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

            const budgetedIncome = monthBudgets.reduce((sum, b) => sum + b.budgeted_income, 0);
            const budgetedExpense = monthBudgets.reduce(
                (sum, b) => sum + b.budgeted_categories.reduce((cs, bc) => cs + bc.amount, 0),
                0,
            );

            const budgetAccountIds = [...new Set(monthBudgets.flatMap((b) => b.accounts.map((a) => a.account_id)))];
            const targetAccountIds = budgetAccountIds.length > 0 ? budgetAccountIds : scopedIds;

            const [incomeAgg, expenseAgg] = await this.prismaService.$transaction([
                this.prismaService.transactions.aggregate({
                    where: this.buildTransactionScope(targetAccountIds, monthStart, monthEnd, actualFilters, {
                        amount: {gt: 0},
                    }),
                    _sum: {amount: true},
                }),
                this.prismaService.transactions.aggregate({
                    where: this.buildTransactionScope(targetAccountIds, monthStart, monthEnd, actualFilters, {
                        amount: {lt: 0},
                    }),
                    _sum: {amount: true},
                }),
            ]);

            return new BudgetVsActualPointEntity({
                year,
                month,
                period: monthStart.toISOString().slice(0, 10),
                budgetedIncome: Math.round(budgetedIncome * 100) / 100,
                budgetedExpense: Math.round(budgetedExpense * 100) / 100,
                actualIncome: Math.round((incomeAgg._sum.amount ?? 0) * 100) / 100,
                actualExpense: Math.round(Math.abs(expenseAgg._sum.amount ?? 0) * 100) / 100,
            });
        });

        return Promise.all(monthPromises);
    }

    private async computeKpisForRange(
        accountIds: string[],
        start: Date,
        end: Date,
        filters: ReportFiltersDto,
    ): Promise<ReportKpiPeriodEntity> {
        const [incomeAgg, expenseAgg, countAgg] = await this.prismaService.$transaction([
            this.prismaService.transactions.aggregate({
                where: this.buildTransactionScope(accountIds, start, end, filters, {amount: {gt: 0}}),
                _sum: {amount: true},
            }),
            this.prismaService.transactions.aggregate({
                where: this.buildTransactionScope(accountIds, start, end, filters, {amount: {lt: 0}}),
                _sum: {amount: true},
            }),
            this.prismaService.transactions.count({
                where: this.buildTransactionScope(accountIds, start, end, filters),
            }),
        ]);

        const income = Math.round((incomeAgg._sum.amount ?? 0) * 100) / 100;
        const expense = Math.round(Math.abs(expenseAgg._sum.amount ?? 0) * 100) / 100;
        const net = Math.round((income - expense) * 100) / 100;
        const savingsRate = income > 0 ? Math.round((net / income) * 10000) / 100 : 0;

        return new ReportKpiPeriodEntity({
            income,
            expense,
            net,
            savingsRate,
            transactionCount: countAgg,
        });
    }

    private buildTransactionScope(
        scopedIds: string[],
        start: Date,
        end: Date,
        filters: ReportFiltersDto,
        extra: Prisma.TransactionsWhereInput = {},
    ): Prisma.TransactionsWhereInput {
        const where: Prisma.TransactionsWhereInput = {
            account_id: {in: scopedIds},
            date: {gte: start, lte: end},
        };
        if (!filters.includeRebalances) where.is_rebalance = false;
        if (filters.excludeTransfers) {
            where.debit_transfer = {is: null};
            where.credit_transfer = {is: null};
        }
        if (filters.budgeted === "budgeted") where.in_budget = true;
        else if (filters.budgeted === "unbudgeted") where.in_budget = false;
        if (filters.categoryIds && filters.categoryIds.length > 0) {
            where.category_id = {in: filters.categoryIds};
        }
        if (filters.merchantIds && filters.merchantIds.length > 0) {
            where.merchant_id = {in: filters.merchantIds};
        }
        return {...where, ...extra};
    }

    private buildTransactionScopeSql(
        scopedIds: string[],
        start: Date,
        end: Date,
        filters: ReportFiltersDto,
        extraSql?: Prisma.Sql,
    ): Prisma.Sql {
        const clauses: Prisma.Sql[] = [
            Prisma.sql`account_id IN (${Prisma.join(scopedIds)})`,
            Prisma.sql`"date" >= ${start}`,
            Prisma.sql`"date" <= ${end}`,
        ];
        if (!filters.includeRebalances) clauses.push(Prisma.sql`is_rebalance = false`);
        if (filters.excludeTransfers) {
            clauses.push(
                Prisma.sql`NOT EXISTS (SELECT 1 FROM transfers t WHERE t.debit_transaction_id = transactions.id OR t.credit_transaction_id = transactions.id)`,
            );
        }
        if (filters.budgeted === "budgeted") clauses.push(Prisma.sql`in_budget = true`);
        else if (filters.budgeted === "unbudgeted") clauses.push(Prisma.sql`in_budget = false`);
        if (filters.categoryIds && filters.categoryIds.length > 0) {
            clauses.push(Prisma.sql`category_id IN (${Prisma.join(filters.categoryIds)})`);
        }
        if (filters.merchantIds && filters.merchantIds.length > 0) {
            clauses.push(Prisma.sql`merchant_id IN (${Prisma.join(filters.merchantIds)})`);
        }
        if (extraSql) clauses.push(extraSql);
        return Prisma.join(clauses, " AND ");
    }

    private async resolveAccountIds(
        user: UserEntity,
        filters: ReportFiltersDto,
    ): Promise<{scoped: string[]; readable: Set<string>}> {
        const readable = new Set(await this.accountAccess.getAccessibleAccountIds(user, "read"));
        let scopeSet: Set<string> = readable;

        if (filters.includeShared === false) {
            const owned = await this.prismaService.accounts.findMany({
                where: {id: {in: [...scopeSet]}, user_id: user.id},
                select: {id: true},
            });
            scopeSet = new Set(owned.map((a) => a.id));
        }

        if (filters.accountIds && filters.accountIds.length > 0) {
            return {scoped: filters.accountIds.filter((id) => scopeSet.has(id)), readable};
        }
        return {scoped: [...scopeSet], readable};
    }

    private parseRange(filters: ReportFiltersDto): {start: Date; end: Date} {
        const start = new Date(filters.startDate);
        const end = new Date(filters.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new BadRequestException("Invalid startDate or endDate");
        }
        if (start > end) {
            throw new BadRequestException("startDate must be before or equal to endDate");
        }
        return {start, end};
    }

    private buildMonthKeys(start: Date, end: Date): string[] {
        const keys: string[] = [];
        const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
        // oxlint-disable-next-line no-unmodified-loop-condition
        while (cursor <= stop) {
            keys.push(cursor.toISOString().slice(0, 10));
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
        return keys;
    }

    private buildMonthEntries(start: Date, end: Date): {year: number; month: number}[] {
        const out: {year: number; month: number}[] = [];
        const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
        // oxlint-disable-next-line no-unmodified-loop-condition
        while (cursor <= stop) {
            out.push({year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1});
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
        return out;
    }

    private fillCashFlowGaps(
        rows: {period: Date; income: number | null; expense: number | null}[],
        start: Date,
        end: Date,
    ): CashFlowPointEntity[] {
        const byKey = new Map<string, {income: number; expense: number}>();
        for (const row of rows) {
            const key = row.period.toISOString().slice(0, 10);
            byKey.set(key, {
                income: Math.round((row.income ?? 0) * 100) / 100,
                expense: Math.round(Math.abs(row.expense ?? 0) * 100) / 100,
            });
        }

        return this.buildMonthKeys(start, end).map((key) => {
            const entry = byKey.get(key) ?? {income: 0, expense: 0};
            const net = Math.round((entry.income - entry.expense) * 100) / 100;
            return new CashFlowPointEntity({period: key, income: entry.income, expense: entry.expense, net});
        });
    }
}
