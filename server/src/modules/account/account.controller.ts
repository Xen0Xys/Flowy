import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import {AccountService} from "./account.service";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {ApiBearerAuth} from "@nestjs/swagger";
import {User} from "../../common/decorators/user.decorator";
import {UserEntity} from "../user/models/entities/user.entity";
import {AccountEntity} from "./models/entities/account.entity";
import {CreateAccountDto} from "./models/dto/create-account.dto";
import {UpdateAccountDto} from "./models/dto/update-account.dto";
import {GetAccountBalanceEvolutionDto} from "./models/dto/get-account-balance-evolution.dto";

@Controller("account")
export class AccountController {
    constructor(private readonly accountService: AccountService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getUserAccounts(@User() user: UserEntity): Promise<AccountEntity[]> {
        return this.accountService.getAccounts(user);
    }

    @Get(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getAccountById(
        @User() user: UserEntity,
        @Param("id") id: string,
    ): Promise<AccountEntity> {
        return this.accountService.getAccount(user, id);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createAccount(
        @User() user: UserEntity,
        @Body() body: CreateAccountDto,
    ): Promise<AccountEntity> {
        return this.accountService.createAccount(
            user,
            body.name,
            body.type,
            body.balance,
        );
    }

    @Patch(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateAccount(
        @User() user: UserEntity,
        @Param("id") id: string,
        @Body() body: UpdateAccountDto,
    ): Promise<AccountEntity> {
        return this.accountService.updateAccount(user, id, body);
    }

    @Get(":id/evolution")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getAccountBalanceEvolution(
        @User() user: UserEntity,
        @Param("id") id: string,
        @Query() query: GetAccountBalanceEvolutionDto,
    ): Promise<Array<{date: Date; balance: number}>> {
        return this.accountService.getAccountBalanceEvolution(
            user,
            id,
            query.startDate,
            query.endDate,
        );
    }

    @Delete(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteAccount(
        @User() user: UserEntity,
        @Param("id") id: string,
    ): Promise<void> {
        return this.accountService.deleteAccount(user, id);
    }
}
