import type {MfaMethod} from "../../mfa-factor.interface";

export class MfaChallengeEntity {
    mfaRequired: true = true;
    challengeToken: string;
    methods: MfaMethod[];

    constructor(partial: Partial<MfaChallengeEntity>) {
        Object.assign(this, partial);
    }
}
