import {Faker} from "@faker-js/faker";

const MIN_TRANSACTIONS_PER_ACCOUNT = 0;
const MAX_TRANSACTIONS_PER_ACCOUNT = 300;

function randomAmount(faker: Faker) {
    const sign = faker.helpers.arrayElement([-1, 1]);
    const value = faker.number.float({min: 5, max: 400, fractionDigits: 2});
    return Number((value * sign).toFixed(2));
}

export async function seedTransactionsForAccount(
    prisma: any,
    accountId: string,
    merchants: Array<{id: string}>,
    categories: Array<{id: string}>,
    faker: Faker,
) {
    const txCount = faker.number.int({
        min: MIN_TRANSACTIONS_PER_ACCOUNT,
        max: MAX_TRANSACTIONS_PER_ACCOUNT,
    });

    let accountBalance = 0;
    const transactionsData: Array<{
        id: string;
        account_id: string;
        amount: number;
        description: string;
        date: Date;
        merchant_id: string | null;
        category_id: string | null;
        is_rebalance: boolean;
    }> = [];

    for (let txIndex = 0; txIndex < txCount; txIndex++) {
        const amount = randomAmount(faker);
        accountBalance += amount;

        const merchantId =
            merchants.length > 0 && faker.datatype.boolean({probability: 0.7})
                ? faker.helpers.arrayElement(merchants).id
                : null;
        const categoryId =
            categories.length > 0 && faker.datatype.boolean({probability: 0.8})
                ? faker.helpers.arrayElement(categories).id
                : null;

        transactionsData.push({
            id: Bun.randomUUIDv7(),
            account_id: accountId,
            amount,
            description: faker.commerce.productName().slice(0, 255),
            date: faker.date.between({
                from: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
                to: new Date(),
            }),
            merchant_id: merchantId,
            category_id: categoryId,
            is_rebalance: txIndex === 0,
        });
    }

    if (transactionsData.length > 0) {
        await prisma.transactions.createMany({
            data: transactionsData,
        });
    }

    await prisma.accounts.update({
        where: {id: accountId},
        data: {
            balance: Number(accountBalance.toFixed(2)),
        },
    });

    return txCount;
}
