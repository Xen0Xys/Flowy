import {Faker} from "@faker-js/faker";
import {PrismaClient} from "../generated/client";

const MIN_TRANSFERS_PER_USER = 0;
const MAX_TRANSFERS_PER_USER = 24;

type SeedAccountRef = {
    id: string;
};

function randomTransferAmount(faker: Faker): number {
    return faker.number.float({
        min: 5,
        max: 1200,
        fractionDigits: 2,
    });
}

export async function seedTransfersForUser(
    prisma: PrismaClient,
    accounts: SeedAccountRef[],
    faker: Faker,
): Promise<number> {
    if (accounts.length < 2) {
        return 0;
    }

    const transferCount = faker.number.int({
        min: MIN_TRANSFERS_PER_USER,
        max: MAX_TRANSFERS_PER_USER,
    });

    if (transferCount === 0) {
        return 0;
    }

    await prisma.$transaction(async (tx) => {
        for (let transferIndex = 0; transferIndex < transferCount; transferIndex++) {
            const debitAccount = faker.helpers.arrayElement(accounts);
            const candidateCreditAccounts = accounts.filter((account) => account.id !== debitAccount.id);
            const creditAccount = faker.helpers.arrayElement(candidateCreditAccounts);
            const amount = randomTransferAmount(faker);
            const roundedAmount = Math.round(amount * 100) / 100;
            const date = faker.date.between({
                from: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
                to: new Date(),
            });

            const debitTransaction = await tx.transactions.create({
                data: {
                    account_id: debitAccount.id,
                    amount: -roundedAmount,
                    description: `Transfer ${transferIndex + 1}`,
                    date,
                    is_rebalance: false,
                },
                select: {
                    id: true,
                },
            });

            const creditTransaction = await tx.transactions.create({
                data: {
                    account_id: creditAccount.id,
                    amount: roundedAmount,
                    description: `Transfer ${transferIndex + 1}`,
                    date,
                    is_rebalance: false,
                },
                select: {
                    id: true,
                },
            });

            await tx.transfers.create({
                data: {
                    debit_transaction_id: debitTransaction.id,
                    credit_transaction_id: creditTransaction.id,
                },
            });

            await tx.accounts.update({
                where: {id: debitAccount.id},
                data: {
                    balance: {
                        decrement: roundedAmount,
                    },
                },
            });

            await tx.accounts.update({
                where: {id: creditAccount.id},
                data: {
                    balance: {
                        increment: roundedAmount,
                    },
                },
            });
        }
    });

    return transferCount;
}
