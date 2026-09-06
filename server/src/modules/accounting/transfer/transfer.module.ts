import {TransactionModule} from "../transaction/transaction.module";
import {TransferController} from "./transfer.controller";
import {TransferService} from "./transfer.service";
import {Module} from "@nestjs/common";
import {AccountModule} from "../account/account.module";

@Module({
    controllers: [TransferController],
    providers: [TransferService],
    imports: [TransactionModule, AccountModule],
    exports: [],
})
export class TransferModule {}
