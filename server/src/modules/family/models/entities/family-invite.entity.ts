export class FamilyInviteEntity {
    code: string;
    email: string;

    constructor(familyInvite: Partial<FamilyInviteEntity>) {
        Object.assign(this, familyInvite);
    }
}
