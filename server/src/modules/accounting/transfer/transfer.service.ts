import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {PrismaService, TxClient} from "../../helper/prisma.service";
import {UserEntity} from "../../users/user/models/entities/user.entity";
import {CreateTransferDto} from "./models/dto/create-transfer.dto";
import {TransactionEntity} from "../transaction/models/entities/transaction.entity";
import {Prisma} from "../../../../prisma/generated/client";
import {TransactionService} from "../transaction/transaction.service";

type TransactionWithRelations = Prisma.TransactionsGetPayload<{
    include: {
        merchant: true;
        category: true;
        credit_transfer: true;
        debit_transfer: true;
        account: true;
    };
}>;

@Injectable()
export class TransferService {
    private readonly logger = new Logger(TransferService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly transactionService: TransactionService,
    ) {}

    async createTransfer(user: UserEntity, createTransferDto: CreateTransferDto): Promise<TransactionEntity[]> {
        if (createTransferDto.debitAccountId === createTransferDto.creditAccountId) {
            throw new BadRequestException("Debit and credit accounts must be different");
        }

        if (createTransferDto.amount <= 0) {
            throw new BadRequestException("Transfer amount must be greater than 0");
        }

        const parsedDate = this.normalizeTransactionDate(createTransferDto.date);
        const normalizedAmount = this.toDecimal(createTransferDto.amount);

        return this.prismaService.$transaction(async (tx) => {
            const prisma = this.prismaService.withTx(tx);
            const debitAccount = await this.getOwnedAccountOrThrow(user, createTransferDto.debitAccountId, tx);
            const creditAccount = await this.getOwnedAccountOrThrow(user, createTransferDto.creditAccountId, tx);

            await prisma.accounts.update({
                where: {id: debitAccount.id},
                data: {
                    balance: this.toDecimal(debitAccount.balance - normalizedAmount),
                },
            });

            await prisma.accounts.update({
                where: {id: creditAccount.id},
                data: {
                    balance: this.toDecimal(creditAccount.balance + normalizedAmount),
                },
            });

            const debitTransaction = await prisma.transactions.create({
                data: {
                    account_id: debitAccount.id,
                    amount: -normalizedAmount,
                    description: createTransferDto.description,
                    date: parsedDate,
                    is_rebalance: false,
                },
            });

            const creditTransaction = await prisma.transactions.create({
                data: {
                    account_id: creditAccount.id,
                    amount: normalizedAmount,
                    description: createTransferDto.description,
                    date: parsedDate,
                    is_rebalance: false,
                },
            });

            await prisma.transfers.create({
                data: {
                    debit_transaction_id: debitTransaction.id,
                    credit_transaction_id: creditTransaction.id,
                },
            });

            return this.hydrateTransferTransactions(prisma, debitTransaction.id, creditTransaction.id);
        });
    }

    async unlinkTransfer(user: UserEntity, transactionId: string): Promise<TransactionEntity[]> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
                debit_transfer: true,
                credit_transfer: true,
            },
        });

        if (!transaction) throw new NotFoundException("Transaction not found");
        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to unlink this transfer");
        }

        const transfer = transaction.debit_transfer ?? transaction.credit_transfer;
        if (!transfer) throw new NotFoundException("Transfer link not found");

        return this.prismaService.$transaction(async (tx) => {
            const prisma = this.prismaService.withTx(tx);
            const linkedTransactionId =
                transfer.debit_transaction_id === transactionId
                    ? transfer.credit_transaction_id
                    : transfer.debit_transaction_id;

            await this.assertTransactionOwnedByUser(user, linkedTransactionId, tx);

            await prisma.transfers.delete({
                where: {id: transfer.id},
            });

            return this.hydrateTransferTransactions(
                prisma,
                transfer.debit_transaction_id,
                transfer.credit_transaction_id,
            );
        });
    }

    async linkTransactions(
        user: UserEntity,
        transactionId1: string,
        transactionId2: string,
    ): Promise<TransactionEntity[]> {
        if (transactionId1 === transactionId2) {
            throw new BadRequestException("You must provide two different transactions");
        }

        const [transaction1, transaction2] = await Promise.all([
            this.getOwnedTransactionOrThrow(user, transactionId1),
            this.getOwnedTransactionOrThrow(user, transactionId2),
        ]);

        if (transaction1.amount === 0 || transaction2.amount === 0) {
            throw new BadRequestException("Transfer transactions cannot have a zero amount");
        }

        if (Math.sign(transaction1.amount) === Math.sign(transaction2.amount)) {
            throw new BadRequestException("Transfer transactions must have opposite signs");
        }

        if (this.toDecimal(Math.abs(transaction1.amount)) !== this.toDecimal(Math.abs(transaction2.amount))) {
            throw new BadRequestException("Transfer transactions must have the same absolute amount");
        }

        if (
            transaction1.debit_transfer ||
            transaction1.credit_transfer ||
            transaction2.debit_transfer ||
            transaction2.credit_transfer
        ) {
            throw new ConflictException("One of the transactions is already linked to another transfer");
        }

        const debitTransactionId = transaction1.amount < 0 ? transaction1.id : transaction2.id;
        const creditTransactionId = transaction1.amount > 0 ? transaction1.id : transaction2.id;

        try {
            await this.prismaService.transfers.create({
                data: {
                    debit_transaction_id: debitTransactionId,
                    credit_transaction_id: creditTransactionId,
                },
            });
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new ConflictException("One of the transactions is already linked to another transfer");
            }

            this.logger.error(`Failed to link transactions ${transactionId1} and ${transactionId2}`);
            throw error;
        }

        return this.hydrateTransferTransactions(this.prismaService, debitTransactionId, creditTransactionId);
    }

    private async getOwnedAccountOrThrow(user: UserEntity, accountId: string, tx?: TxClient) {
        const prisma = this.prismaService.withTx(tx);
        const account = await prisma.accounts.findUnique({
            where: {id: accountId},
        });

        if (!account) throw new NotFoundException("Account not found");
        if (account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this account");
        }

        return account;
    }

    private async getOwnedTransactionOrThrow(
        user: UserEntity,
        transactionId: string,
    ): Promise<TransactionWithRelations> {
        const transaction = await this.prismaService.transactions.findUnique({
            where: {id: transactionId},
            include: {
                account: true,
                merchant: true,
                category: true,
                credit_transfer: true,
                debit_transfer: true,
            },
        });

        if (!transaction) throw new NotFoundException("Transaction not found");
        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to access this transaction");
        }

        return transaction;
    }

    private async assertTransactionOwnedByUser(user: UserEntity, transactionId: string, tx?: TxClient): Promise<void> {
        const prisma = this.prismaService.withTx(tx);
        const transaction = await prisma.transactions.findUnique({
            where: {id: transactionId},
            include: {account: true},
        });

        if (!transaction) throw new NotFoundException("Transaction not found");
        if (transaction.account.user_id !== user.id) {
            throw new ForbiddenException("You do not have permission to unlink this transfer");
        }
    }

    private async hydrateTransferTransactions(
        prisma: TxClient,
        debitTransactionId: string,
        creditTransactionId: string,
    ): Promise<TransactionEntity[]> {
        const transactions = await prisma.transactions.findMany({
            where: {
                id: {
                    in: [debitTransactionId, creditTransactionId],
                },
            },
            include: {
                account: true,
                merchant: true,
                category: true,
                credit_transfer: true,
                debit_transfer: true,
            },
        });

        const debitTransaction = transactions.find((transaction) => transaction.id === debitTransactionId);
        const creditTransaction = transactions.find((transaction) => transaction.id === creditTransactionId);

        if (!debitTransaction || !creditTransaction) {
            throw new NotFoundException("Linked transactions not found");
        }

        return [
            this.transactionService.toTransactionEntity(debitTransaction),
            this.transactionService.toTransactionEntity(creditTransaction),
        ];
    }

    private toDecimal(value: number): number {
        return Math.round(value * 100) / 100;
    }

    private normalizeTransactionDate(date: string | Date): Date {
        const parsedDate = date instanceof Date ? date : new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            throw new BadRequestException("Invalid transfer date. Expected ISO-8601 date or datetime");
        }

        return parsedDate;
    }
}
