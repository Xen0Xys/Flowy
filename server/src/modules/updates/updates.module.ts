import {Module} from "@nestjs/common";
import {UpdatesController} from "./updates.controller";
import {UpdatesService} from "./updates.service";
import {UpdatesTask} from "./updates.task";

@Module({
    controllers: [UpdatesController],
    providers: [UpdatesService, UpdatesTask],
})
export class UpdatesModule {}
