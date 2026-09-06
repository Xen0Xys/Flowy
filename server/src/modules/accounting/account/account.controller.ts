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
import {AccountService} from "./account.service";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {ApiBearerAuth} from "@nestjs/swagger";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {AccountEntity} from "./models/entities/account.entity";
import {CreateAccountDto} from "./models/dto/create-account.dto";
import {UpdateAccountDto} from "./models/dto/update-account.dto";
import {GetAccountBalanceEvolutionDto} from "./models/dto/get-account-balance-evolution.dto";
import {AccountShareService} from "./account-share.service";
import {ShareAccountDto, UpdateAccountShareDto} from "./models/dto/share-account.dto";
import {AccountShareEntity} from "./models/entities/account-share.entity";

@Controller("account")
export class AccountController {
    constructor(
        private readonly accountService: AccountService,
        private readonly accountShareService: AccountShareService,
    ) {}

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
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<AccountEntity> {
        return this.accountService.getAccount(user, id);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async createAccount(@User() user: UserEntity, @Body() body: CreateAccountDto): Promise<AccountEntity> {
        return this.accountService.createAccount(user, body.name, body.type, body.balance);
    }

    @Patch(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateAccount(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Body() body: UpdateAccountDto,
    ): Promise<AccountEntity> {
        return this.accountService.updateAccount(user, id, body);
    }

    @Get(":id/evolution")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async getAccountBalanceEvolution(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Query() query: GetAccountBalanceEvolutionDto,
    ): Promise<Array<{date: Date; balance: number}>> {
        return this.accountService.getAccountBalanceEvolution(user, id, query.startDate, query.endDate);
    }

    @Delete(":id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async deleteAccount(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<void> {
        return this.accountService.deleteAccount(user, id);
    }

    @Get(":id/shares")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async listShares(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
    ): Promise<AccountShareEntity[]> {
        return this.accountShareService.listShares(user, id);
    }

    @Post(":id/shares")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async shareAccount(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Body() body: ShareAccountDto,
    ): Promise<AccountShareEntity> {
        return this.accountShareService.shareAccount(user, id, body.memberId, body.permission);
    }

    @Patch(":id/shares/:memberId")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async updateShare(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Param("memberId", new ParseUUIDPipe({version: "7"})) memberId: string,
        @Body() body: UpdateAccountShareDto,
    ): Promise<AccountShareEntity> {
        return this.accountShareService.updateShare(user, id, memberId, body.permission);
    }

    @Delete(":id/shares/:memberId")
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async revokeShare(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe({version: "7"})) id: string,
        @Param("memberId", new ParseUUIDPipe({version: "7"})) memberId: string,
    ): Promise<void> {
        return this.accountShareService.revokeShare(user, id, memberId);
    }
}
