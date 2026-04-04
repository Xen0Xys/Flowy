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
    UseGuards,
} from "@nestjs/common";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {User} from "../../../common/decorators/user.decorator";
import {BudgetService} from "./budget.service";
import {CreateBudgetDto} from "./models/dto/create-budget.dto";
import {UpdateBudgetDto} from "./models/dto/update-budget.dto";
import {ApiBearerAuth} from "@nestjs/swagger";
import {BudgetEntity} from "./models/entities/budget.entity";

@Controller("budget")
export class BudgetController {
    constructor(private readonly budgetService: BudgetService) {}

    @Get(":year/:month")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getBudgetByPeriod(
        @User() user: UserEntity,
        @Param("year", ParseIntPipe) year: number,
        @Param("month", ParseIntPipe) month: number,
    ): Promise<BudgetEntity | null> {
        return this.budgetService.getBudgetByPeriod(user, year, month);
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
