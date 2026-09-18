import {InstanceConfigService} from "./instance-config.service";
import {MfaCryptoService} from "./mfa-crypto.service";
import {PrismaService} from "./prisma.service";
import {Global, Module} from "@nestjs/common";

@Global()
@Module({
    providers: [PrismaService, InstanceConfigService, MfaCryptoService],
    exports: [PrismaService, InstanceConfigService, MfaCryptoService],
    imports: [],
    controllers: [],
})
export class HelperModule {}
