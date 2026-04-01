import {Faker} from "@faker-js/faker";
import * as crypto from "crypto";
import argon2 from "argon2";

export const USERS_COUNT = 40;

export async function seedUsers(prisma: any, familyIds: string[] = [], faker: Faker) {
    const passwordHash = await argon2.hash(faker.internet.password());

    const users: Array<any> = [];

    // Guarantee one ADMIN per family
    for (const familyId of familyIds) {
        users.push({
            id: Bun.randomUUIDv7(),
            username: faker.internet.username().slice(0, 30),
            email: faker.internet.email(),
            password: passwordHash,
            jwt_id: crypto.randomBytes(16).toString("hex"),
            family_id: familyId,
            family_role: "ADMIN",
        });
    }

    const randomUsersCount = Math.max(USERS_COUNT - familyIds.length, 0);
    for (let i = 0; i < randomUsersCount; i++) {
        const id = Bun.randomUUIDv7();
        const family_id =
            familyIds.length > 0 && Math.random() < 0.7 ? familyIds[Math.floor(Math.random() * familyIds.length)] : null;

        users.push({
            id,
            username: faker.internet.username().slice(0, 30),
            email: faker.internet.email(),
            password: passwordHash,
            jwt_id: crypto.randomBytes(16).toString("hex"),
            family_id,
            family_role: family_id ? "USER" : null,
        });
    }

    // upsert users one by one to ensure relations work and keep idempotency
    for (const u of users) {
        await prisma.users.upsert({
            where: {id: u.id},
            create: {
                ...u,
            },
            update: {
                ...u,
            },
        });
    }

    return users.map((u) => u.id);
}
