import {Module} from "@nestjs/common";
import {AuthModule} from "../auth.module";
import {UserModule} from "../../users/user/user.module";
import {SsoController} from "./sso.controller";
import {SsoService} from "./sso.service";
import {SsoConfigService} from "./sso-config.service";
import {SsoCleanupService} from "./sso-cleanup.service";
import {OidcProviderService} from "./providers/oidc-provider.service";
import {OAuth2ProviderService} from "./providers/oauth2-provider.service";
import {MfaChallengeModule} from "../mfa/mfa-challenge.module";

@Module({
    imports: [AuthModule, UserModule, MfaChallengeModule],
    controllers: [SsoController],
    providers: [SsoConfigService, SsoService, SsoCleanupService, OidcProviderService, OAuth2ProviderService],
    exports: [SsoConfigService, SsoService],
})
export class SsoModule {}
