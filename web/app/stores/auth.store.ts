import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {useUserStore} from "~/stores/user.store";

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
                const data = await apiFetch<any>("/user/login", {
                    method: "POST",
                    body: credentials,
                });
                if (!data || !data.token) {
                    toast.error("Login failed: missing token from server");
                    throw new Error("Login response missing token");
                }

                this.setToken(data.token);
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success("Connected");
                return data;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? "Login failed";
                toast.error(message);
                throw new Error(message);
            }
        },

        async register(payload: {username: string; email: string; password: string}) {
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/user/register", {
                    method: "POST",
                    body: payload,
                });
                if (!data || !data.token) {
                    toast.error("Registration failed: missing token from server");
                    throw new Error("Register response missing token");
                }

                this.setToken(data.token);
                const userStore = useUserStore();
                userStore.user = data.user ?? null;
                toast.success("Account created");
                return data;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? "Registration failed";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
