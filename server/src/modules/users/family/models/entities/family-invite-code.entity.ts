export class FamilyInviteCodeEntity {
    code: string;

    constructor(familyInviteCode: Partial<FamilyInviteCodeEntity>) {
        Object.assign(this, familyInviteCode);
    }
}
