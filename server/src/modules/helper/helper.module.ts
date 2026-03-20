import {InstanceConfigService} from "./instance-config.service";
import {PrismaService} from "./prisma.service";
import {Global, Module} from "@nestjs/common";

@Global()
@Module({
    providers: [PrismaService, InstanceConfigService],
    exports: [PrismaService, InstanceConfigService],
    imports: [],
    controllers: [],
})
export default class HelperModule {}
