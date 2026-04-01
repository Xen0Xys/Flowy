import {Controller, Get} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";

@Controller()
export class AppController {
    constructor(private readonly configService: ConfigService) {}

    @Get("version")
    getVersion(): {version: string} {
        return {
            version: this.configService.get<string>("npm_package_version") || "unknown",
        };
    }
}
