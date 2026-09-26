import {Injectable, Logger} from "@nestjs/common";
import {Cron, CronExpression} from "@nestjs/schedule";
import {PrismaService} from "../../helper/prisma.service";

@Injectable()
export class SsoCleanupService {
    private readonly logger = new Logger(SsoCleanupService.name);

    constructor(private readonly prisma: PrismaService) {}

    @Cron(CronExpression.EVERY_10_MINUTES)
    async cleanupExpired(): Promise<void> {
        const now = new Date();
        const result = await this.prisma.ssoStates.deleteMany({where: {expires_at: {lt: now}}});
        if (result.count > 0) {
            this.logger.log(`Expired SSO states purged count=${result.count}`);
        }
    }
}
