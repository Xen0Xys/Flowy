export type MfaMethod = "totp" | "backup_code";

export interface MfaFactor {
    readonly method: MfaMethod;
    isEnrolledFor(userId: string): Promise<boolean>;
    verify(userId: string, code: string): Promise<boolean>;
}
