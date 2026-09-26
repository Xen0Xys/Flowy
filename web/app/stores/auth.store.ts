import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {startAuthentication} from "@simplewebauthn/browser";
import {useApi} from "~/composables/useApi";
import {useAccountStore} from "~/stores/account.store";
import {useBudgetStore} from "~/stores/budget.store";
import {useFamilyStore} from "~/stores/family.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useTransactionStore} from "~/stores/transaction.store";
import {useUserStore} from "~/stores/user.store";
import {i18nT} from "~/utils/i18n";

export type LoginCredentials = {
    email: string;
    password: string;
};

export type MfaMethod = "totp" | "backup_code" | "passkey";

export type MfaChallenge = {
    challengeToken: string;
    methods: MfaMethod[];
};

export class MfaChallengeExpiredError extends Error {
    constructor(message?: string) {
        super(message ?? "MFA challenge expired");
        this.name = "MfaChallengeExpiredError";
    }
}

const COOKIE_TOKEN_KEY = "flowy:token";

function isExpiredChallengeError(err: unknown): boolean {
    const status =
        (err as {statusCode?: number; status?: number; response?: {status?: number}} | null)?.statusCode ??
        (err as {status?: number} | null)?.status ??
        (err as {response?: {status?: number}} | null)?.response?.status;
    if (status !== 401) return false;
    const message =
        (err as {data?: {message?: string}; message?: string} | null)?.data?.message ??
        (err as {message?: string} | null)?.message ??
        "";
    return typeof message === "string" && /challenge/i.test(message);
}

export const useAuthStore = defineStore("auth", {
    state: () => ({
        token: null as string | null,
        mfaChallenge: null as MfaChallenge | null,
    }),

    getters: {
        isAuthenticated: (state) => !!state.token,
        getToken: (state) => state.token,
        hasMfaChallenge: (state) => !!state.mfaChallenge,
    },

    actions: {
        setToken(token: string | null) {
            this.token = token;
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY, {
                    maxAge: 60 * 60 * 24 * 30,
                    path: "/",
                    sameSite: "lax",
                    secure: import.meta.env.PROD,
                });
                cookie.value = token;
            } catch {
                return;
            }
        },

        loadFromStorage() {
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY);
                this.token = cookie.value ?? null;
            } catch {
                this.token = null;
            }
        },

        logout() {
            this.token = null;
            this.mfaChallenge = null;

            const userStore = useUserStore();
            const accountStore = useAccountStore();
            const budgetStore = useBudgetStore();
            const familyStore = useFamilyStore();
            const referenceStore = useReferenceStore();
            const transactionStore = useTransactionStore();

            userStore.$reset();
            accountStore.$reset();
            budgetStore.$reset();
            familyStore.$reset();
            referenceStore.$reset();
            transactionStore.$reset();

            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY);
                cookie.value = null;
            } catch {
                return;
            }
        },

        clearMfaChallenge() {
            this.mfaChallenge = null;
        },

        setMfaChallenge(challenge: MfaChallenge | null) {
            this.mfaChallenge = challenge;
        },

        async login(credentials: LoginCredentials): Promise<{mfaRequired: boolean}> {
            const {apiFetch} = useApi();
            this.mfaChallenge = null;
            try {
                const data = await apiFetch<any>("/auth/login", {
                    method: "POST",
                    body: credentials,
                });

                if (data?.mfaRequired) {
                    if (!data.challengeToken) {
                        toast.error(i18nT("auth.store.errors.loginMissingToken"));
                        throw new Error(i18nT("auth.store.errors.loginResponseMissingToken"));
                    }
                    this.mfaChallenge = {
                        challengeToken: data.challengeToken,
                        methods: data.methods ?? ["totp"],
                    };
                    return {mfaRequired: true};
                }

                if (!data || !data.token) {
                    toast.error(i18nT("auth.store.errors.loginMissingToken"));
                    throw new Error(i18nT("auth.store.errors.loginResponseMissingToken"));
                }

                this.setToken(data.token);
                this.mfaChallenge = null;
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success(i18nT("auth.store.success.connected"));
                return {mfaRequired: false};
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("auth.store.errors.loginFailed");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async verifyMfa(payload: {code: string; method: MfaMethod}): Promise<{mfaAutoDisabled: boolean}> {
            if (payload.method === "passkey") {
                return this.verifyMfaPasskey();
            }
            if (!this.mfaChallenge) {
                throw new MfaChallengeExpiredError(i18nT("auth.mfa.errors.noChallenge"));
            }
            const {apiFetch} = useApi();
            const endpoint = payload.method === "totp" ? "/auth/mfa/totp/verify" : "/auth/mfa/backup-codes/verify";
            try {
                const data = await apiFetch<any>(endpoint, {
                    method: "POST",
                    body: {
                        challengeToken: this.mfaChallenge.challengeToken,
                        code: payload.code,
                    },
                });
                if (!data?.token) {
                    toast.error(i18nT("auth.store.errors.loginMissingToken"));
                    throw new Error(i18nT("auth.store.errors.loginResponseMissingToken"));
                }
                this.setToken(data.token);
                this.mfaChallenge = null;
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                const mfaAutoDisabled = data.mfaAutoDisabled === true;
                if (mfaAutoDisabled) {
                    toast.warning(i18nT("auth.mfa.autoDisabledToast"), {duration: 10000});
                } else {
                    toast.success(i18nT("auth.store.success.connected"));
                }
                return {mfaAutoDisabled};
            } catch (err: any) {
                if (isExpiredChallengeError(err)) {
                    this.mfaChallenge = null;
                    throw new MfaChallengeExpiredError();
                }
                const message = err?.data?.message ?? err?.message ?? i18nT("auth.mfa.errors.invalidCode");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async verifyMfaPasskey(): Promise<{mfaAutoDisabled: boolean}> {
            if (!this.mfaChallenge) {
                throw new MfaChallengeExpiredError(i18nT("auth.mfa.errors.noChallenge"));
            }
            const {apiFetch} = useApi();
            const challengeToken = this.mfaChallenge.challengeToken;
            try {
                const options = await apiFetch<any>("/auth/mfa/passkey/challenge/options", {
                    method: "POST",
                    body: {challengeToken},
                });
                const response = await startAuthentication({optionsJSON: options});
                const data = await apiFetch<any>("/auth/mfa/passkey/challenge/verify", {
                    method: "POST",
                    body: {challengeToken, response},
                });
                if (!data?.token) {
                    toast.error(i18nT("auth.store.errors.loginMissingToken"));
                    throw new Error(i18nT("auth.store.errors.loginResponseMissingToken"));
                }
                this.setToken(data.token);
                this.mfaChallenge = null;
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success(i18nT("auth.store.success.connected"));
                return {mfaAutoDisabled: false};
            } catch (err: any) {
                if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
                    // User cancelled the passkey prompt: silent no-op so they can retry.
                    throw err;
                }
                if (isExpiredChallengeError(err)) {
                    this.mfaChallenge = null;
                    throw new MfaChallengeExpiredError();
                }
                const message = err?.data?.message ?? err?.message ?? i18nT("auth.mfa.errors.invalidCode");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async register(payload: {username: string; email: string; password: string}) {
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/auth/register", {
                    method: "POST",
                    body: payload,
                });
                if (!data || !data.token) {
                    toast.error(i18nT("auth.store.errors.registerMissingToken"));
                    throw new Error(i18nT("auth.store.errors.registerResponseMissingToken"));
                }

                this.setToken(data.token);
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success(i18nT("auth.store.success.accountCreated"));
                return data;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("auth.store.errors.registrationFailed");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },
    },
});
