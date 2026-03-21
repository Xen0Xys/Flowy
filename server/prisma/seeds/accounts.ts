import {Faker} from "@faker-js/faker";

const MIN_ACCOUNTS_PER_USER = 1;
const MAX_ACCOUNTS_PER_USER = 4;

const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT", "CASH", "INVESTMENT", "OTHER"] as const;

export async function seedAccounts(prisma: any, userId: string, faker: Faker) {
    const userAccountsCount = faker.number.int({
        min: MIN_ACCOUNTS_PER_USER,
        max: MAX_ACCOUNTS_PER_USER,
    });

    const accounts: Array<{id: string}> = [];

    for (let accountIndex = 0; accountIndex < userAccountsCount; accountIndex++) {
        const accountId = Bun.randomUUIDv7();
        const accountType = faker.helpers.arrayElement(ACCOUNT_TYPES);
        const accountName = `${faker.finance.accountName()} ${accountIndex + 1}`.slice(0, 50);

        const account = await prisma.accounts.create({
            data: {
                id: accountId,
                user_id: userId,
                type: accountType,
                name: accountName,
                balance: 0,
            },
            select: {
                id: true,
            },
        });

        accounts.push(account);
    }

    return accounts;
}
