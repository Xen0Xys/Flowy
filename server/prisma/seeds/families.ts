import {Faker} from "@faker-js/faker";

export const FAMILIES_COUNT = 10;

export async function seedFamilies(prisma: any, faker: Faker) {
    const families: Array<any> = [];
    for (let i = 0; i < FAMILIES_COUNT; i++) {
        const id = Bun.randomUUIDv7();
        // Capitalize first word letters from faker.word.words(2)
        const words = faker.word
            .words(2)
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        families.push({
            id,
            name: words.slice(0, 50),
            currency: faker.finance?.currencyCode?.() ?? "USD",
        });
    }

    for (const family of families) {
        await prisma.family.upsert({
            where: {id: family.id},
            create: family,
            update: family,
        });
    }

    return families.map((family) => family.id);
}
