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
    console.log(
        `\n✅  Default config seeded successfully! (${Date.now() - start}ms)`,
    );

    // Development-only data population using Faker
    if (process.env.NODE_ENV === "development") {
        console.log("\n🔧 NODE_ENV=development detected — seeding dev data...");

        // dynamic imports so modules are only loaded in development
        const {Faker, en} = await import("@faker-js/faker");
        const fakerSeed = Number(process.env.SEED_FAKER_SEED) || Date.now();
        // create Faker instance using provided seed (Faker constructor expects locale definitions)
        const faker = new Faker({locale: en});
        // explicit seed to make generated data reproducible when desired
        faker.seed(fakerSeed);

        const {seedFamilies} = await import("./seeds/families.js");
        const {seedUsers} = await import("./seeds/users.js");
        const {seedInvites} = await import("./seeds/invites.js");

        // Families
        start = Date.now();
        const families = await (seedFamilies as any)(prisma, faker);
        console.log(
            `✅  Families seeded (${families.length}) (${Date.now() - start}ms)`,
        );

        // Users
        start = Date.now();
        const userIds = await (seedUsers as any)(prisma, families, faker);
        console.log(
            `✅  Users seeded (${userIds.length}) (${Date.now() - start}ms)`,
        );

        // Invites
        start = Date.now();
        const invites = await (seedInvites as any)(prisma, families, faker);
        console.log(
            `✅  Invites seeded (${invites.length}) (${Date.now() - start}ms)`,
        );
    }

    console.log(`\n✅  Seeding completed ! (${Date.now() - gStart}ms)`);
}

// oxlint-disable-next-line no-unused-vars
async function idSeed(
    table: any,
    data: any[],
    update: boolean = true,
): Promise<void> {
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

async function seed(
    table: any,
    data: any[],
    id_field: any,
    update: boolean = true,
): Promise<void> {
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
