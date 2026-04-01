import {ConfigKey, PrismaClient} from "./generated/client";
import {PrismaPg} from "@prisma/adapter-pg";

// initialize Prisma Client
const adapter: PrismaPg = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma: PrismaClient = new PrismaClient({adapter});

async function generateDefaultConfig() {
    const config = [
        {
            key: ConfigKey.SELF_HOSTED,
            value: process.env.SELF_HOSTED || "true",
        },
        {
            key: ConfigKey.REGISTRATION_ENABLED,
            value: process.env.REGISTRATION_ENABLED || "true",
        },
    ];
    await seed(prisma.config, config, "key", false);
}

async function main() {
    const gStart = Date.now();

    // Default config
    let start = Date.now();
    await generateDefaultConfig();
    console.log(`\n✅  Default config seeded successfully! (${Date.now() - start}ms)`);

    // Development-only data population using Faker
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
        console.log("\n🔧 NODE_ENV=development detected — seeding dev data...");

        // dynamic imports so modules are only loaded in development
        const {Faker, en} = await import("@faker-js/faker");
        const fakerSeed = Number(process.env.SEED_FAKER_SEED) || Date.now();
        // create Faker instance using provided seed (Faker constructor expects locale definitions)
        const faker = new Faker({locale: en});
        // explicit seed to make generated data reproducible when desired
        faker.seed(fakerSeed);

        // @ts-ignore
        const {seedFamilies} = await import("./seeds/families");
        // @ts-ignore
        const {seedUsers} = await import("./seeds/users");
        // @ts-ignore
        const {seedInvites} = await import("./seeds/invites");
        // @ts-ignore
        const {seedAccounts} = await import("./seeds/accounts.js");
        // @ts-ignore
        const {seedTransactionsForAccount} = await import("./seeds/transactions.js");
        // @ts-ignore
        const {seedUserMerchants} = await import("./seeds/user-merchants.js");
        // @ts-ignore
        const {seedUserCategories} = await import("./seeds/user-categories.js");

        // Families
        start = Date.now();
        const families = await (seedFamilies as any)(prisma, faker);
        console.log(`✅  Families seeded (${families.length}) (${Date.now() - start}ms)`);

        // Users
        start = Date.now();
        const userIds = await (seedUsers as any)(prisma, families, faker);
        console.log(`✅  Users seeded (${userIds.length}) (${Date.now() - start}ms)`);

        // Invites
        start = Date.now();
        const invites = await (seedInvites as any)(prisma, families, faker);
        console.log(`✅  Invites seeded (${invites.length}) (${Date.now() - start}ms)`);

        // Accounts / Transactions / Merchants / Categories
        start = Date.now();
        console.log("🧹  Cleaning accounting tables...");
        await prisma.transactions.deleteMany({});
        await prisma.accounts.deleteMany({});
        await prisma.userMerchants.deleteMany({});
        await prisma.userCategories.deleteMany({});
        console.log("✅  Accounting tables cleaned");

        const users = await prisma.users.findMany({
            select: {
                id: true,
            },
        });
        console.log(`👥  Seeding accounting data for ${users.length} users...`);

        let accountsCount = 0;
        let transactionsCount = 0;
        let merchantsCount = 0;
        let categoriesCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const merchants = await (seedUserMerchants as any)(prisma, user.id, faker);
            merchantsCount += merchants.length;

            const categories = await (seedUserCategories as any)(prisma, user.id, faker);
            categoriesCount += categories.length;

            const accounts = await (seedAccounts as any)(prisma, user.id, faker);
            accountsCount += accounts.length;

            for (const account of accounts) {
                transactionsCount += await (seedTransactionsForAccount as any)(
                    prisma,
                    account.id,
                    merchants,
                    categories,
                    faker,
                );
            }

            console.log(
                `   • User ${i + 1}/${users.length}: accounts=${accounts.length}, merchants=${merchants.length}, categories=${categories.length}`,
            );
        }

        const accountingSeed = {
            accounts: accountsCount,
            transactions: transactionsCount,
            merchants: merchantsCount,
            categories: categoriesCount,
        };
        console.log(
            `✅  Accounts seeded (${accountingSeed.accounts}), transactions (${accountingSeed.transactions}), merchants (${accountingSeed.merchants}), categories (${accountingSeed.categories}) (${Date.now() - start}ms)`,
        );
    }

    console.log(`\n✅  Seeding completed ! (${Date.now() - gStart}ms)`);
}

// oxlint-disable-next-line no-unused-vars
async function idSeed(table: any, data: any[], update: boolean = true): Promise<void> {
    for (let i = 0; i < data.length; i++) {
        await table.upsert({
            where: {id: data[i].id},
            update: update
                ? {
                      ...data[i],
                  }
                : {},
            create: {
                ...data[i],
            },
        });
    }
}

async function seed(table: any, data: any[], id_field: any, update: boolean = true): Promise<void> {
    for (let i = 0; i < data.length; i++) {
        const whereClause: any = {};
        whereClause[id_field] = data[i][id_field];
        await table.upsert({
            where: whereClause,
            update: update
                ? {
                      ...data[i],
                  }
                : {},
            create: {
                ...data[i],
            },
        });
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
