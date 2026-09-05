import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {RecurringTransactionService} from "./recurring-transaction.service";
import {CreateRecurringTransactionDto} from "./models/dto/create-recurring-transaction.dto";
import {UpdateRecurringTransactionDto} from "./models/dto/update-recurring-transaction.dto";
import {ListRecurringTransactionsDto} from "./models/dto/list-recurring-transactions.dto";
import {ListExecutionsDto} from "./models/dto/list-executions.dto";
import {CalendarQueryDto} from "./models/dto/calendar-query.dto";
import {ToggleRecurringTransactionDto} from "./models/dto/toggle-recurring-transaction.dto";
import {RecurringTransactionEntity} from "./models/entities/recurring-transaction.entity";
import {ListExecutionsResultEntity} from "./models/entities/recurring-transaction-execution.entity";
import {RecurringCalendarEntity} from "./models/entities/recurring-calendar.entity";

@Controller("recurring-transaction")
export class RecurringTransactionController {
    constructor(private readonly service: RecurringTransactionService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async list(
        @User() user: UserEntity,
        @Query() query: ListRecurringTransactionsDto,
    ): Promise<RecurringTransactionEntity[]> {
        return this.service.list(user, query);
    }

    @Get("calendar")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getCalendar(@User() user: UserEntity, @Query() query: CalendarQueryDto): Promise<RecurringCalendarEntity> {
        return this.service.getCalendar(user, query);
    }

    @Get(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getById(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<RecurringTransactionEntity> {
        return this.service.getById(user, id);
    }

    @Get(":id/executions")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async listExecutions(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Query() query: ListExecutionsDto,
    ): Promise<ListExecutionsResultEntity> {
        return this.service.listExecutions(user, id, query);
    }

    @Post("account/:accountId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async create(
        @User() user: UserEntity,
        @Param("accountId", new ParseUUIDPipe({version: "7"})) accountId: string,
        @Body() dto: CreateRecurringTransactionDto,
    ): Promise<RecurringTransactionEntity> {
        return this.service.create(user, accountId, dto);
    }

    @Patch(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async update(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Body() dto: UpdateRecurringTransactionDto,
    ): Promise<RecurringTransactionEntity> {
        return this.service.update(user, id, dto);
    }

    @Patch(":id/toggle")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async toggle(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Body() body: ToggleRecurringTransactionDto,
    ): Promise<RecurringTransactionEntity> {
        return this.service.toggle(user, id, body.isEnabled);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async delete(@User() user: UserEntity, @Param("id", new ParseUUIDPipe({version: "7"})) id: string): Promise<void> {
        await this.service.delete(user, id);
    }
}
