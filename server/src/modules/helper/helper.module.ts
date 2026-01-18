import {Global, Module} from "@nestjs/common";
import {PrismaService} from "./prisma.service";
import {InstanceConfigService} from "./instance-config.service";

@Global()
@Module({
    providers: [PrismaService, InstanceConfigService],
    exports: [PrismaService, InstanceConfigService],
    imports: [],
    controllers: [],
})
export default class HelperModule {}
