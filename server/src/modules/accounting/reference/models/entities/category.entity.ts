export class CategoryEntity {
    id: string;
    userId: string;
    name: string;
    hexColor: string;
    icon: string;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<CategoryEntity>) {
        Object.assign(this, partial);
    }
}
