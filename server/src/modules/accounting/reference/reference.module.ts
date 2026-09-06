import {Module} from "@nestjs/common";
import {ReferenceService} from "./reference.service";
import {ReferenceController} from "./reference.controller";
import {ReferenceMatcherService} from "./reference-matcher.service";
import {AccountModule} from "../account/account.module";

@Module({
    providers: [ReferenceService, ReferenceMatcherService],
    controllers: [ReferenceController],
    exports: [ReferenceService, ReferenceMatcherService],
    imports: [AccountModule],
})
export class ReferenceModule {}
