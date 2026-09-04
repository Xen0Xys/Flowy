import {Module} from "@nestjs/common";
import {RecurringTransactionController} from "./recurring-transaction.controller";
import {RecurringTransactionService} from "./recurring-transaction.service";
import {RecurringTransactionTask} from "./recurring-transaction.task";

@Module({
    controllers: [RecurringTransactionController],
    providers: [RecurringTransactionService, RecurringTransactionTask],
    exports: [RecurringTransactionService],
})
export class RecurringTransactionModule {}
