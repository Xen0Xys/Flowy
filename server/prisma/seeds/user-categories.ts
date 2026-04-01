import {Faker} from "@faker-js/faker";

const MIN_CATEGORIES_PER_USER = 0;
const MAX_CATEGORIES_PER_USER = 10;

const CATEGORY_NAMES = [
    "Groceries",
    "Transport",
    "Housing",
    "Utilities",
    "Health",
    "Restaurants",
    "Shopping",
    "Travel",
    "Education",
    "Leisure",
    "Subscriptions",
    "Insurance",
    "Taxes",
    "Pets",
    "Gifts",
] as const;

const ICONOIR_ICONS = [
    "iconoir:adobe-illustrator",
    "iconoir:wallet",
    "iconoir:bank",
    "iconoir:shop",
    "iconoir:cart",
    "iconoir:credit-card",
    "iconoir:coins",
    "iconoir:house",
    "iconoir:car",
    "iconoir:bus",
    "iconoir:train",
    "iconoir:airplane",
    "iconoir:internet",
    "iconoir:smartphone-device",
    "iconoir:health-shield",
    "iconoir:graduation-cap",
    "iconoir:gift",
    "iconoir:pizza-slice",
    "iconoir:coffee-cup",
    "iconoir:shopping-bag",
] as const;

function uniqueValues(values: readonly string[], count: number, faker: Faker) {
    return faker.helpers.shuffle([...values]).slice(0, count);
}

export async function seedUserCategories(prisma: any, userId: string, faker: Faker) {
    const categoryCount = faker.number.int({
        min: MIN_CATEGORIES_PER_USER,
        max: MAX_CATEGORIES_PER_USER,
    });
    const categoryNames = uniqueValues(CATEGORY_NAMES, categoryCount, faker);
    const categoryIcons = uniqueValues(ICONOIR_ICONS, categoryCount, faker);

    const categories: Array<{id: string}> = [];

    for (let i = 0; i < categoryNames.length; i++) {
        const category = await prisma.userCategories.create({
            data: {
                id: Bun.randomUUIDv7(),
                user_id: userId,
                name: categoryNames[i].slice(0, 50),
                hex_color: faker.color.rgb({
                    format: "hex",
                    casing: "upper",
                }),
                icon: categoryIcons[i],
            },
            select: {
                id: true,
            },
        });
        categories.push(category);
    }

    return categories;
}
