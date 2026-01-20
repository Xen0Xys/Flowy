export class InstanceSettingsEntity {
    registrationEnabled: boolean;
    instanceOwner: string;

    constructor(partial: Partial<InstanceSettingsEntity>) {
        Object.assign(this, partial);
    }
}
