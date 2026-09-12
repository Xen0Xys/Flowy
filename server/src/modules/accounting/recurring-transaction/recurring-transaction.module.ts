import {Module} from "@nestjs/common";
import {RecurringTransactionController} from "./recurring-transaction.controller";
import {RecurringTransactionService} from "./recurring-transaction.service";
import {RecurringTransactionTask} from "./recurring-transaction.task";
import {AccountModule} from "../account/account.module";

@Module({
    controllers: [RecurringTransactionController],
    providers: [RecurringTransactionService, RecurringTransactionTask],
    exports: [RecurringTransactionService],
    imports: [AccountModule],
})
export class RecurringTransactionModule {}
