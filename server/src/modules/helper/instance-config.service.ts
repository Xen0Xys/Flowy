import {Injectable, InternalServerErrorException} from "@nestjs/common";
import {ConfigKey} from "../../../prisma/generated/enums";
import {PrismaService} from "./prisma.service";

@Injectable()
export class InstanceConfigService {
    constructor(private readonly prismaService: PrismaService) {}

    async isSelfHosted(): Promise<boolean> {
        const selfHosted = await this.prismaService.config.findUnique({
            where: {
                key: ConfigKey.SELF_HOSTED,
            },
        });
        if (!selfHosted)
            throw new InternalServerErrorException(
                "Self-hosted configuration not found",
            );
        return selfHosted ? selfHosted.value === "true" : false;
    }

    async registrationAllowed(): Promise<boolean> {
        const registrationConfig = await this.prismaService.config.findUnique({
            where: {
                key: ConfigKey.REGISTRATION_ENABLED,
            },
        });
        if (!registrationConfig)
            throw new InternalServerErrorException(
                "Registration configuration not found",
            );
        return registrationConfig ? registrationConfig.value === "true" : false;
    }
}
