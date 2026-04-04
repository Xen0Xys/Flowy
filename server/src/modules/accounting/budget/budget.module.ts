import {BudgetController} from "./budget.controller";
import {BudgetService} from "./budget.service";
import {Module} from "@nestjs/common";

@Module({
    controllers: [BudgetController],
    providers: [BudgetService],
    exports: [],
    imports: [],
})
export class BudgetModule {}
