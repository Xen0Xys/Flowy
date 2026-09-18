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
    UseGuards,
} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {Throttle} from "@nestjs/throttler";
import {JwtAuthGuard} from "../../../common/guards/jwt-auth.guard";
import {User} from "../../../common/decorators/user.decorator";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {MfaService} from "./mfa.service";
import {MfaTotpSetupDto} from "./models/dto/mfa-totp-setup.dto";
import {MfaTotpConfirmDto} from "./models/dto/mfa-totp-confirm.dto";
import {MfaDisableDto} from "./models/dto/mfa-disable.dto";
import {MfaRegenerateCodesDto} from "./models/dto/mfa-regenerate-codes.dto";
import {MfaVerifyDto} from "./models/dto/mfa-verify.dto";
import {MfaPasskeyRegisterOptionsDto} from "./models/dto/mfa-passkey-register-options.dto";
import {MfaPasskeyRegisterVerifyDto} from "./models/dto/mfa-passkey-register-verify.dto";
import {MfaPasskeyRenameDto} from "./models/dto/mfa-passkey-rename.dto";
import {MfaPasskeyDeleteDto} from "./models/dto/mfa-passkey-delete.dto";
import {MfaPasskeyChallengeOptionsDto} from "./models/dto/mfa-passkey-challenge-options.dto";
import {MfaPasskeyChallengeVerifyDto} from "./models/dto/mfa-passkey-challenge-verify.dto";
import {MfaSetupEntity} from "./models/entities/mfa-setup.entity";
import {MfaConfirmEntity} from "./models/entities/mfa-confirm.entity";
import {MfaBackupCodesEntity} from "./models/entities/mfa-backup-codes.entity";
import {MfaVerifyEntity} from "./models/entities/mfa-verify.entity";
import {PasskeyEntity} from "./models/entities/passkey.entity";
import {PasskeyRegisterEntity} from "./models/entities/passkey-register.entity";

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
    async verifyTotp(@Body() body: MfaVerifyDto): Promise<MfaVerifyEntity> {
        return this.mfaService.verifyChallenge(body.challengeToken, body.code, "totp");
    }

    @Post("backup-codes/verify")
    @Throttle({default: {limit: 10, ttl: 60_000}})
    async verifyBackupCode(@Body() body: MfaVerifyDto): Promise<MfaVerifyEntity> {
        return this.mfaService.verifyChallenge(body.challengeToken, body.code, "backup_code");
    }

    @Get("passkey")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async listPasskeys(@User() user: UserEntity): Promise<PasskeyEntity[]> {
        const passkeys = await this.mfaService.listPasskeys(user);
        return passkeys.map((p) => new PasskeyEntity(p));
    }

    @Post("passkey/register/options")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async passkeyRegisterOptions(@User() user: UserEntity, @Body() body: MfaPasskeyRegisterOptionsDto) {
        return this.mfaService.startPasskeyRegistration(user, body.currentPassword);
    }

    @Post("passkey/register/verify")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @ApiBearerAuth()
    async passkeyRegisterVerify(
        @User() user: UserEntity,
        @Body() body: MfaPasskeyRegisterVerifyDto,
    ): Promise<PasskeyRegisterEntity> {
        const result = await this.mfaService.confirmPasskeyRegistration(user, body.response, body.label);
        return new PasskeyRegisterEntity({
            passkey: new PasskeyEntity(result.passkey),
            token: result.token,
            backupCodes: result.backupCodes,
        });
    }

    @Patch("passkey/:id")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 10, ttl: 60_000}})
    @ApiBearerAuth()
    async renamePasskey(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe()) id: string,
        @Body() body: MfaPasskeyRenameDto,
    ): Promise<PasskeyEntity> {
        const passkey = await this.mfaService.renamePasskey(user, id, body.label);
        return new PasskeyEntity(passkey);
    }

    @Delete("passkey/:id")
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 10, ttl: 60_000}})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    async deletePasskey(
        @User() user: UserEntity,
        @Param("id", new ParseUUIDPipe()) id: string,
        @Body() body: MfaPasskeyDeleteDto,
    ): Promise<void> {
        await this.mfaService.deletePasskey(user, id, body.currentPassword);
    }

    @Post("passkey/challenge/options")
    @Throttle({default: {limit: 10, ttl: 60_000}})
    async passkeyChallengeOptions(@Body() body: MfaPasskeyChallengeOptionsDto) {
        return this.mfaService.startPasskeyChallenge(body.challengeToken);
    }

    @Post("passkey/challenge/verify")
    @Throttle({default: {limit: 10, ttl: 60_000}})
    async passkeyChallengeVerify(@Body() body: MfaPasskeyChallengeVerifyDto): Promise<MfaVerifyEntity> {
        return this.mfaService.verifyPasskeyChallenge(body.challengeToken, body.response);
    }
}
