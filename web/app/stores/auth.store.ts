import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";

const i18nT = (key: string, params?: Record<string, unknown>) => {
    const i18n = useNuxtApp().$i18n;
    return (params ? (i18n?.t(key, params) as string | undefined) : (i18n?.t(key) as string | undefined)) ?? key;
};

export type LoginCredentials = {
    email: string;
    password: string;
};

const COOKIE_TOKEN_KEY = "flowy:token";

export const useAuthStore = defineStore("auth", {
    state: () => ({
        token: null as string | null,
    }),

    getters: {
        isAuthenticated: (state) => !!state.token,
        getToken: (state) => state.token,
    },

    actions: {
        setToken(token: string | null) {
            this.token = token;
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY, {
                    maxAge: 60 * 60 * 24 * 30,
                    path: "/",
                    sameSite: "lax",
                } as any);
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
            const userStore = useUserStore();
            userStore.user = null;

            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY);
                cookie.value = null;
            } catch {
                return;
            }
        },

        async login(credentials: LoginCredentials) {
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/auth/login", {
                    method: "POST",
                    body: credentials,
                });
                if (!data || !data.token) {
                    toast.error(i18nT("auth.store.errors.loginMissingToken"));
                    throw new Error(i18nT("auth.store.errors.loginResponseMissingToken"));
                }

                this.setToken(data.token);
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success(i18nT("auth.store.success.connected"));
                return data;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("auth.store.errors.loginFailed");
                toast.error(message);
                throw new Error(message);
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
                throw new Error(message);
            }
        },
    },
});
