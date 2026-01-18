import {Injectable} from "@nestjs/common";
import {PrismaService} from "./prisma.service";
import {ConfigKey} from "../../../prisma/generated/enums";

@Injectable()
export class InstanceConfigService {
    constructor(private readonly prismaService: PrismaService) {}

    async isSelfHosted(): Promise<boolean> {
        const selfHosted = await this.prismaService.config.findUnique({
            where: {
                key: ConfigKey.SELF_HOSTED,
            },
        });
        return selfHosted ? selfHosted.value === "true" : false;
    }

    async registrationAllowed(): Promise<boolean> {
        const registrationConfig = await this.prismaService.config.findUnique({
            where: {
                key: ConfigKey.REGISTRATION_ENABLED,
            },
        });
        return registrationConfig ? registrationConfig.value === "true" : false;
    }
}
