import {Controller, Get, UseGuards} from "@nestjs/common";
import {ApiBearerAuth} from "@nestjs/swagger";
import {JwtAuthGuard} from "../../common/guards/jwt-auth.guard";
import {UpdateStatusEntity} from "./models/entities/update-status.entity";
import {UpdatesService} from "./updates.service";

@Controller("updates")
export class UpdatesController {
    constructor(private readonly updatesService: UpdatesService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    getStatus(): UpdateStatusEntity {
        return this.updatesService.getState();
    }
}
