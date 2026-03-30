import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseArrayPipe,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {User} from "../../../common/decorators/user.decorator";
import {TransactionService} from "./transaction.service";
import {CreateTransactionDto} from "./models/dto/create-transaction.dto";
import {UpdateTransactionDto} from "./models/dto/update-transaction.dto";
import {ApiBearerAuth} from "@nestjs/swagger";
import {TransactionEntity} from "./models/entities/transaction.entity";
import {SearchTransactionsDto} from "./models/dto/search-transactions.dto";
import {SearchTransactionsResultEntity} from "./models/entities/search-transactions-result.entity";

@Controller("transaction")
export class TransactionController {
    constructor(private readonly transactionService: TransactionService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getAllTransactions(@User() user: UserEntity): Promise<TransactionEntity[]> {
        return this.transactionService.getTransactions(user);
    }

    @Get("search")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async searchTransactions(
        @User() user: UserEntity,
        @Query() query: SearchTransactionsDto,
    ): Promise<SearchTransactionsResultEntity> {
        return this.transactionService.searchTransactions(user, query);
    }

    @Get(":accountId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getTransactionByAccountId(
        @User() user: UserEntity,
        @Param("accountId", new ParseUUIDPipe({version: "7"})) accountId: string,
    ): Promise<TransactionEntity[]> {
        return this.transactionService.getTransactionsByAccountId(user, accountId);
    }

    @Post(":accountId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async addTransaction(
        @User() user: UserEntity,
        @Param("accountId", new ParseUUIDPipe({version: "7"})) accountId: string,
        @Body() createTransactionDto: CreateTransactionDto,
    ): Promise<TransactionEntity> {
        return this.transactionService.addTransactions(user, accountId, createTransactionDto);
    }

    @Post(":accountId/bulk/test")
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async testBulkTransactions(
        @User() user: UserEntity,
        @Param("accountId", new ParseUUIDPipe({version: "7"})) accountId: string,
        @Body(new ParseArrayPipe({items: CreateTransactionDto})) createTransactionDtos: CreateTransactionDto[],
    ): Promise<{
        wouldInsertCount: number;
        duplicates: CreateTransactionDto[];
    }> {
        return this.transactionService.testBulkTransactions(user, accountId, createTransactionDtos);
    }

    @Post(":accountId/bulk")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async addBulkTransactions(
        @User() user: UserEntity,
        @Param("accountId", new ParseUUIDPipe({version: "7"})) accountId: string,
        @Body(new ParseArrayPipe({items: CreateTransactionDto})) createTransactionDtos: CreateTransactionDto[],
    ): Promise<{
        insertedCount: number;
        duplicates: CreateTransactionDto[];
    }> {
        return this.transactionService.addBulkTransactions(user, accountId, createTransactionDtos);
    }

    @Patch(":transactionId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateTransaction(
        @User() user: UserEntity,
        @Param("transactionId", new ParseUUIDPipe({version: "7"})) transactionId: string,
        @Body() updateTransactionDto: UpdateTransactionDto,
    ): Promise<TransactionEntity> {
        return this.transactionService.updateTransaction(user, transactionId, updateTransactionDto);
    }

    @Delete(":transactionId")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteTransaction(
        @User() user: UserEntity,
        @Param("transactionId", new ParseUUIDPipe({version: "7"})) transactionId: string,
    ): Promise<void> {
        await this.transactionService.deleteTransaction(user, transactionId);
    }
}
