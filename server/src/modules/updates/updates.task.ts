import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import {Cron, CronExpression} from "@nestjs/schedule";
import {UpdatesService} from "./updates.service";

@Injectable()
export class UpdatesTask implements OnModuleInit {
    private readonly logger = new Logger(UpdatesTask.name);

    constructor(private readonly updatesService: UpdatesService) {}

    async onModuleInit(): Promise<void> {
        this.logger.log("Startup: fetching latest release from GitHub");
        await this.updatesService.refresh();
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async runScheduled(): Promise<void> {
        await this.updatesService.refresh();
    }
}
