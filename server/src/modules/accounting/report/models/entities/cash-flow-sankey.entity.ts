export type CashFlowSankeyNodeKind = "income" | "expense" | "hub" | "savings" | "deficit";

export class CashFlowSankeyNodeEntity {
    id!: string;
    label!: string;
    kind!: CashFlowSankeyNodeKind;
    hexColor?: string;
    icon?: string;

    constructor(partial: Partial<CashFlowSankeyNodeEntity>) {
        Object.assign(this, partial);
    }
}

export class CashFlowSankeyLinkEntity {
    source!: string;
    target!: string;
    value!: number;

    constructor(partial: Partial<CashFlowSankeyLinkEntity>) {
        Object.assign(this, partial);
    }
}

export class CashFlowSankeyEntity {
    nodes!: CashFlowSankeyNodeEntity[];
    links!: CashFlowSankeyLinkEntity[];
    totals!: {income: number; expense: number; net: number};

    constructor(partial: Partial<CashFlowSankeyEntity>) {
        Object.assign(this, partial);
    }
}
