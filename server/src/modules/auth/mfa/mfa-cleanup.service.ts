import {Injectable, Logger} from "@nestjs/common";
import {Cron, CronExpression} from "@nestjs/schedule";
import {PrismaService} from "../../helper/prisma.service";

@Injectable()
export class MfaCleanupService {
    private readonly logger = new Logger(MfaCleanupService.name);

    constructor(private readonly prisma: PrismaService) {}

    @Cron(CronExpression.EVERY_HOUR)
    async cleanupExpired(): Promise<void> {
        const now = new Date();
        const [challengeTokens, webauthn] = await Promise.all([
            this.prisma.mfaChallengeTokens.deleteMany({where: {expires_at: {lt: now}}}),
            this.prisma.webAuthnChallenges.deleteMany({where: {expires_at: {lt: now}}}),
        ]);
        if (challengeTokens.count > 0 || webauthn.count > 0) {
            this.logger.log(
                `Expired MFA rows purged challenge_tokens=${challengeTokens.count} webauthn=${webauthn.count}`,
            );
        }
    }
}
