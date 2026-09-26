import {Module} from "@nestjs/common";
import {MfaChallengeService} from "./mfa-challenge.service";

// Standalone module that exposes only MfaChallengeService, imported by
// AuthModule, MfaModule and SsoModule. Kept separate from MfaModule to avoid a
// circular import chain (MfaModule already imports AuthModule).
@Module({
    providers: [MfaChallengeService],
    exports: [MfaChallengeService],
})
export class MfaChallengeModule {}
