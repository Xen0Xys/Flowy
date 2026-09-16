import {Controller, Get, Query, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {ReportService} from "./report.service";
import {ReportFiltersDto, TopMerchantsDto} from "./models/dto/report-filters.dto";
import {ReportKpiEntity} from "./models/entities/report-kpi.entity";
import {CashFlowPointEntity} from "./models/entities/cash-flow.entity";
import {CategoryBreakdownEntity, CategoryTrendEntity} from "./models/entities/category-breakdown.entity";
import {MerchantBreakdownEntity} from "./models/entities/merchant-breakdown.entity";
import {AccountBreakdownEntity} from "./models/entities/account-breakdown.entity";
import {NetWorthPointEntity} from "./models/entities/net-worth.entity";
import {BudgetVsActualPointEntity} from "./models/entities/budget-vs-actual.entity";
import {CashFlowSankeyEntity} from "./models/entities/cash-flow-sankey.entity";

@Controller("report")
export class ReportController {
    constructor(private readonly reportService: ReportService) {}

    @Get("kpis")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getKpis(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<ReportKpiEntity> {
        return this.reportService.getKpis(user, query);
    }

    @Get("cash-flow")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCashFlow(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<CashFlowPointEntity[]> {
        return this.reportService.getCashFlow(user, query);
    }

    @Get("cash-flow-sankey")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCashFlowSankey(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<CashFlowSankeyEntity> {
        return this.reportService.getCashFlowSankey(user, query);
    }

    @Get("by-category")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getByCategory(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<CategoryBreakdownEntity[]> {
        return this.reportService.getByCategory(user, query);
    }

    @Get("category-trend")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCategoryTrend(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<CategoryTrendEntity> {
        return this.reportService.getCategoryTrend(user, query);
    }

    @Get("by-merchant")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getByMerchant(@User() user: UserEntity, @Query() query: TopMerchantsDto): Promise<MerchantBreakdownEntity[]> {
        return this.reportService.getByMerchant(user, query);
    }

    @Get("by-account")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getByAccount(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<AccountBreakdownEntity[]> {
        return this.reportService.getByAccount(user, query);
    }

    @Get("net-worth")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getNetWorth(@User() user: UserEntity, @Query() query: ReportFiltersDto): Promise<NetWorthPointEntity[]> {
        return this.reportService.getNetWorth(user, query);
    }

    @Get("budget-vs-actual")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getBudgetVsActual(
        @User() user: UserEntity,
        @Query() query: ReportFiltersDto,
    ): Promise<BudgetVsActualPointEntity[]> {
        return this.reportService.getBudgetVsActual(user, query);
    }
}
