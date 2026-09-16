import {Module} from "@nestjs/common";
import {ReportController} from "./report.controller";
import {ReportService} from "./report.service";
import {AccountModule} from "../account/account.module";

@Module({
    controllers: [ReportController],
    providers: [ReportService],
    imports: [AccountModule],
    exports: [ReportService],
})
export class ReportModule {}
