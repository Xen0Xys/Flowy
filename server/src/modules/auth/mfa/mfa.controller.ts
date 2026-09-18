import {Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {Throttle} from "@nestjs/throttler";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {LoginUserEntity} from "../../users/user/models/entities/login-user.entity";
import {MfaService} from "./mfa.service";
import {MfaTotpSetupDto} from "./models/dto/mfa-totp-setup.dto";
import {MfaTotpConfirmDto} from "./models/dto/mfa-totp-confirm.dto";
import {MfaDisableDto} from "./models/dto/mfa-disable.dto";
import {MfaRegenerateCodesDto} from "./models/dto/mfa-regenerate-codes.dto";
import {MfaVerifyDto} from "./models/dto/mfa-verify.dto";
import {MfaSetupEntity} from "./models/entities/mfa-setup.entity";
import {MfaConfirmEntity} from "./models/entities/mfa-confirm.entity";
import {MfaBackupCodesEntity} from "./models/entities/mfa-backup-codes.entity";

@Controller("auth/mfa")
export class MfaController {
    constructor(private readonly mfaService: MfaService) {}

    @Post("totp/setup")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async setupTotp(@User() user: UserEntity, @Body() body: MfaTotpSetupDto): Promise<MfaSetupEntity> {
        const result = await this.mfaService.setupTotp(user, body.currentPassword);
        return new MfaSetupEntity(result);
    }

    @Post("totp/setup/confirm")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async confirmTotpSetup(@User() user: UserEntity, @Body() body: MfaTotpConfirmDto): Promise<MfaConfirmEntity> {
        const result = await this.mfaService.confirmTotpSetup(user, body.code);
        return new MfaConfirmEntity(result);
    }

    @Delete("totp")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    async disable(@User() user: UserEntity, @Body() body: MfaDisableDto): Promise<void> {
        await this.mfaService.disableMfa(user, body.currentPassword, body.code);
    }

    @Post("backup-codes/regenerate")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async regenerateBackupCodes(
        @User() user: UserEntity,
        @Body() body: MfaRegenerateCodesDto,
    ): Promise<MfaBackupCodesEntity> {
        const codes = await this.mfaService.regenerateBackupCodes(user, body.currentPassword, body.code);
        return new MfaBackupCodesEntity({codes});
    }

    @Post("totp/verify")
    @Throttle({default: {limit: 10, ttl: 60_000}})
    async verifyTotp(@Body() body: MfaVerifyDto): Promise<LoginUserEntity> {
        return this.mfaService.verifyChallenge(body.challengeToken, body.code, "totp");
    }

    @Post("backup-codes/verify")
    @Throttle({default: {limit: 10, ttl: 60_000}})
    async verifyBackupCode(@Body() body: MfaVerifyDto): Promise<LoginUserEntity> {
        return this.mfaService.verifyChallenge(body.challengeToken, body.code, "backup_code");
    }
}
