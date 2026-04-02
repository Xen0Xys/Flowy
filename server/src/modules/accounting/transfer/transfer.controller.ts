import {TransferService} from "./transfer.service";
import {Controller, Delete, Param, Post, UseGuards} from "@nestjs/common";
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
    async createTransfer(@User() user: UserEntity, createTransferDto: CreateTransferDto): Promise<TransactionEntity[]> {
        return null;
    }

    @Delete("unlink/:transactionId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async unlinkTransfer(
        @User() user: UserEntity,
        @Param("transactionId") transactionId: string,
    ): Promise<TransactionEntity[]> {
        return null;
    }

    @Post("link/:transactionId1/:transactionId2")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async linkTransactions(
        @User() user: UserEntity,
        @Param("transactionId1") transactionId1: string,
        @Param("transactionId2") transactionId2: string,
    ): Promise<TransactionEntity[]> {
        // If amount are differents, throw error;
        return null;
    }
}
