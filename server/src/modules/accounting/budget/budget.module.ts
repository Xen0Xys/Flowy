import {BudgetController} from "./budget.controller";
import {BudgetService} from "./budget.service";
import {Module} from "@nestjs/common";
import {RecurringTransactionModule} from "../recurring-transaction/recurring-transaction.module";

@Module({
    controllers: [BudgetController],
    providers: [BudgetService],
    exports: [],
    imports: [RecurringTransactionModule],
})
export class BudgetModule {}
