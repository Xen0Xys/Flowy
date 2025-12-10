import {PrismaClient} from "./generated/client";
import {PrismaPg} from "@prisma/adapter-pg";

// initialize Prisma Client
const adapter: PrismaPg = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma: PrismaClient = new PrismaClient({adapter});

async function generateAdminUser() {
    const adminUser = {
        id: "0195dc7c-f315-7881-b35b-da9cbb6ee4a0",
    };

    await idSeed(prisma.users, [adminUser], false);
}

async function main() {
    const gStart = Date.now();

    // Admin user
    let start = Date.now();
    await generateAdminUser();
    console.log(
        `\n✅  Admin user seeded successfully! (${Date.now() - start}ms)`,
    );

    console.log(`\n✅  Seeding completed ! (${Date.now() - gStart}ms)`);
}

async function idSeed(table: any, data: any[], update: boolean = true) {
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

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
