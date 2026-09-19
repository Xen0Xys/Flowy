export class PasskeyEntity {
    id: string;
    label: string;
    transports: string[];
    createdAt: Date;
    lastUsedAt: Date | null;

    constructor(partial: Partial<PasskeyEntity>) {
        Object.assign(this, partial);
    }
}
