export class NetWorthPointEntity {
    date!: string;
    total!: number;
    byType!: Record<string, number>;

    constructor(partial: Partial<NetWorthPointEntity>) {
        Object.assign(this, partial);
    }
}
