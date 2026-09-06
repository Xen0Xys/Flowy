import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {User} from "../../../common/decorators/user.decorator";
import {BudgetService} from "./budget.service";
import {CreateBudgetDto} from "./models/dto/create-budget.dto";
import {GetPlannedByAccountsDto} from "./models/dto/get-planned-by-accounts.dto";
import {UpdateBudgetDto} from "./models/dto/update-budget.dto";
import {ApiBearerAuth} from "@nestjs/swagger";
import {BudgetEntity} from "./models/entities/budget.entity";
import {BudgetSpendingCategoryEntity, BudgetSpendingEntity} from "./models/entities/budget-spending.entity";
import type {AvailableMonth} from "./models/entities/budget-spending.entity";

@Controller("budget")
export class BudgetController {
    constructor(private readonly budgetService: BudgetService) {}

    @Get("available-months")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getAvailableMonths(@User() user: UserEntity): Promise<AvailableMonth[]> {
        return this.budgetService.getAvailableMonths(user);
    }

    @Get("planned")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getPlannedForAccounts(
        @User() user: UserEntity,
        @Query() query: GetPlannedByAccountsDto,
    ): Promise<BudgetSpendingCategoryEntity[]> {
        return this.budgetService.getPlannedForAccounts(user, query);
    }

    @Get(":year/:month")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getBudgetsByPeriod(
        @User() user: UserEntity,
        @Param("year", ParseIntPipe) year: number,
        @Param("month", ParseIntPipe) month: number,
    ): Promise<BudgetEntity[]> {
        return this.budgetService.getBudgetsByPeriod(user, year, month);
    }

    @Get(":budgetId/spending")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getSpending(
        @User() user: UserEntity,
        @Param("budgetId", new ParseUUIDPipe({version: "7"})) budgetId: string,
    ): Promise<BudgetSpendingEntity> {
        return this.budgetService.getSpending(user, budgetId);
    }

    @Get(":budgetId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getBudgetById(
        @User() user: UserEntity,
        @Param("budgetId", new ParseUUIDPipe({version: "7"})) budgetId: string,
    ): Promise<BudgetEntity> {
        return this.budgetService.getBudgetById(user, budgetId);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createBudget(@User() user: UserEntity, @Body() createBudgetDto: CreateBudgetDto): Promise<BudgetEntity> {
        return this.budgetService.createBudget(user, createBudgetDto);
    }

    @Put(":budgetId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateBudget(
        @User() user: UserEntity,
        @Param("budgetId", new ParseUUIDPipe({version: "7"})) budgetId: string,
        @Body() updateBudgetDto: UpdateBudgetDto,
    ): Promise<BudgetEntity> {
        return this.budgetService.updateBudget(user, budgetId, updateBudgetDto);
    }

    @Delete(":budgetId")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteBudget(
        @User() user: UserEntity,
        @Param("budgetId", new ParseUUIDPipe({version: "7"})) budgetId: string,
    ): Promise<void> {
        return this.budgetService.deleteBudget(user, budgetId);
    }
}
