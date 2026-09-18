export type MfaMethod = "totp" | "backup_code" | "passkey";

export interface MfaFactor {
    readonly method: MfaMethod;
    isEnrolledFor(userId: string): Promise<boolean>;
}

export interface CodeMfaFactor extends MfaFactor {
    verify(userId: string, code: string): Promise<boolean>;
}
