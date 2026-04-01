import {UserEntity} from "../../../user/models/entities/user.entity";

export class FamilyEntity {
    name: string;
    currency: string;
    owner: UserEntity;
    members: UserEntity[];

    constructor(familyEntity: Partial<FamilyEntity>) {
        Object.assign(this, familyEntity);
    }
}
