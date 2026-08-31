import {Module} from "@nestjs/common";
import {ReferenceService} from "./reference.service";
import {ReferenceController} from "./reference.controller";
import {ReferenceMatcherService} from "./reference-matcher.service";

@Module({
    providers: [ReferenceService, ReferenceMatcherService],
    controllers: [ReferenceController],
    exports: [ReferenceService, ReferenceMatcherService],
    imports: [],
})
export class ReferenceModule {}
