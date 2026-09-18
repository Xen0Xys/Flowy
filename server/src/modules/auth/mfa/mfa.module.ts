import {Module} from "@nestjs/common";
import {AuthModule} from "../auth.module";
import {UserModule} from "../../users/user/user.module";
import {MfaController} from "./mfa.controller";
import {MfaService} from "./mfa.service";
import {MfaCleanupService} from "./mfa-cleanup.service";
import {TotpFactorService} from "./factors/totp-factor.service";
import {BackupCodeFactorService} from "./factors/backup-code-factor.service";
import {PasskeyFactorService} from "./factors/passkey-factor.service";

@Module({
    imports: [AuthModule, UserModule],
    controllers: [MfaController],
    providers: [MfaService, MfaCleanupService, TotpFactorService, BackupCodeFactorService, PasskeyFactorService],
    exports: [MfaService],
})
export class MfaModule {}
