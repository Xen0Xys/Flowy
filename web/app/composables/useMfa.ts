import {toast} from "vue-sonner";
import {startRegistration} from "@simplewebauthn/browser";
import {useApi} from "~/composables/useApi";
import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

export type MfaSetupResponse = {
    secret: string;
    otpauthUrl: string;
};

export type MfaConfirmResponse = {
    token: string;
    backupCodes: string[];
};

export type MfaBackupCodesResponse = {
    codes: string[];
};

export type PasskeyResponse = {
    id: string;
    label: string;
    transports: string[];
    createdAt: string;
    lastUsedAt: string | null;
};

export type PasskeyRegisterResponse = {
    passkey: PasskeyResponse;
    token: string | null;
    backupCodes: string[] | null;
};

export function useMfa() {
    const {apiFetch} = useApi();
    const authStore = useAuthStore();
    const userStore = useUserStore();

    async function setupTotp(currentPassword: string): Promise<MfaSetupResponse> {
        try {
            return await apiFetch<MfaSetupResponse>("/auth/mfa/totp/setup", {
                method: "POST",
                body: {currentPassword},
            });
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.errors.setupFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function confirmTotpSetup(code: string): Promise<MfaConfirmResponse> {
        try {
            const response = await apiFetch<MfaConfirmResponse>("/auth/mfa/totp/setup/confirm", {
                method: "POST",
                body: {code},
            });
            if (response?.token) authStore.setToken(response.token);
            if (userStore.user) userStore.user = {...userStore.user, mfaEnabled: true};
            toast.success(i18nT("profile.mfa.toasts.enabled"));
            return response;
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.errors.confirmFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function disableMfa(currentPassword: string, code: string): Promise<void> {
        try {
            await apiFetch("/auth/mfa/totp", {
                method: "DELETE",
                body: {currentPassword, code},
            });
            if (userStore.user) userStore.user = {...userStore.user, mfaEnabled: false};
            toast.success(i18nT("profile.mfa.toasts.disabled"));
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.errors.disableFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function regenerateBackupCodes(currentPassword: string, code: string): Promise<string[]> {
        try {
            const response = await apiFetch<MfaBackupCodesResponse>("/auth/mfa/backup-codes/regenerate", {
                method: "POST",
                body: {currentPassword, code},
            });
            toast.success(i18nT("profile.mfa.toasts.codesRegenerated"));
            return response.codes;
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.errors.regenerateFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function adminResetUserMfa(userId: string, currentPassword: string): Promise<void> {
        try {
            await apiFetch(`/admin/users/${userId}/mfa`, {
                method: "DELETE",
                body: {currentPassword},
            });
            toast.success(i18nT("settings.users.mfa.toasts.reset"));
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("settings.users.mfa.errors.resetFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function listPasskeys(): Promise<PasskeyResponse[]> {
        try {
            return await apiFetch<PasskeyResponse[]>("/auth/mfa/passkey", {method: "GET"});
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.errors.listPasskeysFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function registerPasskey(currentPassword: string, label: string): Promise<PasskeyRegisterResponse> {
        try {
            const options = await apiFetch<any>("/auth/mfa/passkey/register/options", {
                method: "POST",
                body: {currentPassword},
            });
            const response = await startRegistration({optionsJSON: options});
            const result = await apiFetch<PasskeyRegisterResponse>("/auth/mfa/passkey/register/verify", {
                method: "POST",
                body: {response, label},
            });
            if (result?.token) authStore.setToken(result.token);
            if (userStore.user) userStore.user = {...userStore.user, mfaEnabled: true};
            toast.success(i18nT("profile.mfa.passkeys.toasts.registered"));
            return result;
        } catch (err: any) {
            if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
                throw err;
            }
            if (err?.name === "InvalidStateError") {
                const message = i18nT("profile.mfa.passkeys.errors.alreadyRegistered");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.passkeys.errors.registerFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function renamePasskey(id: string, label: string): Promise<PasskeyResponse> {
        try {
            const passkey = await apiFetch<PasskeyResponse>(`/auth/mfa/passkey/${id}`, {
                method: "PATCH",
                body: {label},
            });
            toast.success(i18nT("profile.mfa.passkeys.toasts.renamed"));
            return passkey;
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.passkeys.errors.renameFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    async function deletePasskey(id: string, currentPassword: string): Promise<void> {
        try {
            await apiFetch(`/auth/mfa/passkey/${id}`, {
                method: "DELETE",
                body: {currentPassword},
            });
            toast.success(i18nT("profile.mfa.passkeys.toasts.deleted"));
        } catch (err: any) {
            const message = err?.data?.message ?? err?.message ?? i18nT("profile.mfa.passkeys.errors.deleteFailed");
            toast.error(message);
            throw new Error(message, {cause: err});
        }
    }

    return {
        setupTotp,
        confirmTotpSetup,
        disableMfa,
        regenerateBackupCodes,
        adminResetUserMfa,
        listPasskeys,
        registerPasskey,
        renamePasskey,
        deletePasskey,
    };
}
