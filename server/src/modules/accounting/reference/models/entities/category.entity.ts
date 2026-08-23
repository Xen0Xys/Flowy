export class CategoryEntity {
    id: string;
    userId: string;
    name: string;
    hexColor: string;
    icon: string;
    keywords: string[];
    primaryKeyword: string | null;
    autoCompleteEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;

    constructor(partial: Partial<CategoryEntity>) {
        Object.assign(this, partial);
    }
}
