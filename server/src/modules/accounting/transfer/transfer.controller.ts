import {TransferService} from "./transfer.service";
import {Body, Controller, Delete, Param, ParseUUIDPipe, Post, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {ApiBearerAuth} from "@nestjs/swagger";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {CreateTransferDto} from "./models/dto/create-transfer.dto";
import {TransactionEntity} from "../transaction/models/entities/transaction.entity";

@Controller("transfer")
export class TransferController {
    constructor(private readonly transferService: TransferService) {}

    @Post("")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createTransfer(
        @User() user: UserEntity,
        @Body() createTransferDto: CreateTransferDto,
    ): Promise<TransactionEntity[]> {
        return this.transferService.createTransfer(user, createTransferDto);
    }

    @Delete("unlink/:transactionId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async unlinkTransfer(
        @User() user: UserEntity,
        @Param("transactionId", new ParseUUIDPipe({version: "7"})) transactionId: string,
    ): Promise<TransactionEntity[]> {
        return this.transferService.unlinkTransfer(user, transactionId);
    }

    @Post("link/:transactionId1/:transactionId2")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async linkTransactions(
        @User() user: UserEntity,
        @Param("transactionId1", new ParseUUIDPipe({version: "7"})) transactionId1: string,
        @Param("transactionId2", new ParseUUIDPipe({version: "7"})) transactionId2: string,
    ): Promise<TransactionEntity[]> {
        return this.transferService.linkTransactions(user, transactionId1, transactionId2);
    }
}
