import {TransactionModule} from "../transaction/transaction.module";
import {TransferController} from "./transfer.controller";
import {TransferService} from "./transfer.service";
import {Module} from "@nestjs/common";

@Module({
    controllers: [TransferController],
    providers: [TransferService],
    imports: [TransactionModule],
    exports: [],
})
export class TransferModule {}
