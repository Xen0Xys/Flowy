import {Faker} from "@faker-js/faker";

export const MIN_INVITES_PER_FAMILY = 0;
export const MAX_INVITES_PER_FAMILY = 2;

export async function seedInvites(
    prisma: any,
    familyIds: string[] = [],
    faker: Faker,
) {
    const invites: Array<any> = [];

    for (const familyId of familyIds) {
        const invitesCount = faker.number.int({
            min: MIN_INVITES_PER_FAMILY,
            max: MAX_INVITES_PER_FAMILY,
        });

        for (let i = 0; i < invitesCount; i++) {
            const code = Bun.randomUUIDv7();
            invites.push({
                code,
                email: faker.internet.email(),
                family_id: familyId,
                expires_at: faker.date.soon({days: 30}),
            });
        }
    }

    for (const invite of invites) {
        await prisma.familyInvites.upsert({
            where: {code: invite.code},
            create: invite,
            update: invite,
        });
    }

    return invites;
}
