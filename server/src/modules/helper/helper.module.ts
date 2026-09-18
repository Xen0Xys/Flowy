import {InstanceConfigService} from "./instance-config.service";
import {MfaCryptoService} from "./mfa-crypto.service";
import {PrismaService} from "./prisma.service";
import {WebAuthnConfigService} from "./webauthn-config.service";
import {Global, Module} from "@nestjs/common";

@Global()
@Module({
    providers: [PrismaService, InstanceConfigService, MfaCryptoService, WebAuthnConfigService],
    exports: [PrismaService, InstanceConfigService, MfaCryptoService, WebAuthnConfigService],
    imports: [],
    controllers: [],
})
export class HelperModule {}
