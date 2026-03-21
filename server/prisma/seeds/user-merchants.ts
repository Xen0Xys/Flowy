import {Faker} from "@faker-js/faker";

const MIN_MERCHANTS_PER_USER = 0;
const MAX_MERCHANTS_PER_USER = 4;

const MERCHANT_NAME_POOL = [
    "Fresh Market",
    "Metro Transit",
    "Corner Bakery",
    "CloudStream",
    "Tech Depot",
    "Fuel Station",
    "City Pharmacy",
    "Book Nook",
    "Quick Eats",
    "Home Supplies",
    "Sport Center",
    "Cinema Hub",
    "Pet Store",
    "Travel Point",
    "Coffee Spot",
] as const;

function uniqueValues(values: readonly string[], count: number, faker: Faker) {
    return faker.helpers.shuffle([...values]).slice(0, count);
}

export async function seedUserMerchants(prisma: any, userId: string, faker: Faker) {
    const merchantCount = faker.number.int({
        min: MIN_MERCHANTS_PER_USER,
        max: MAX_MERCHANTS_PER_USER,
    });
    const merchantNames = uniqueValues(MERCHANT_NAME_POOL, merchantCount, faker);

    const merchants: Array<{id: string}> = [];

    for (const merchantName of merchantNames) {
        const merchant = await prisma.userMerchants.create({
            data: {
                id: Bun.randomUUIDv7(),
                user_id: userId,
                name: merchantName.slice(0, 50),
            },
            select: {
                id: true,
            },
        });
        merchants.push(merchant);
    }

    return merchants;
}
