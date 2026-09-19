export class CategoryBreakdownEntity {
    categoryId!: string | null;
    name!: string;
    hexColor!: string;
    icon!: string;
    spent!: number;
    count!: number;
    previousSpent?: number;

    constructor(partial: Partial<CategoryBreakdownEntity>) {
        Object.assign(this, partial);
    }
}

export class CategoryTrendCategoryEntity {
    categoryId!: string | null;
    name!: string;
    hexColor!: string;
    icon!: string;
    total!: number;

    constructor(partial: Partial<CategoryTrendCategoryEntity>) {
        Object.assign(this, partial);
    }
}

export class CategoryTrendPointEntity {
    period!: string;
    spentByCategoryId!: Record<string, number>;

    constructor(partial: Partial<CategoryTrendPointEntity>) {
        Object.assign(this, partial);
    }
}

export class CategoryTrendEntity {
    categories!: CategoryTrendCategoryEntity[];
    points!: CategoryTrendPointEntity[];

    constructor(partial: Partial<CategoryTrendEntity>) {
        Object.assign(this, partial);
    }
}
