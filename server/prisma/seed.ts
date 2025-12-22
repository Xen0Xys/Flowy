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
