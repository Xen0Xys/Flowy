import {Module} from "@nestjs/common";
import {TransactionService} from "./transaction.service";
import {TransactionController} from "./transaction.controller";
import {ReferenceModule} from "../reference/reference.module";
import {AccountModule} from "../account/account.module";

@Module({
    providers: [TransactionService],
    controllers: [TransactionController],
    exports: [TransactionService],
    imports: [ReferenceModule, AccountModule],
})
export class TransactionModule {}
