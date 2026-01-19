import {defineStore} from "pinia";
import {useApi} from "~/composables/useApi";

export type User = {
    id: string;
    username: string;
    email: string;
    jwt_id?: string;
    family_id?: string | null;
    family_role?: string | null;
    [key: string]: any;
};

export type LoginCredentials = {
    email: string;
    password: string;
};

const COOKIE_TOKEN_KEY = "flowy:token";

export const useUserStore = defineStore("user", {
    state: () => ({
        user: null as User | null,
        token: null as string | null,
    }),

    getters: {
        isAuthenticated: (state) => !!state.token,
        getUser: (state) => state.user,
        getToken: (state) => state.token,
    },

    actions: {
        setUser(user: User | null) {
            this.user = user;
        },

        setToken(token: string | null) {
            this.token = token;
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY, {
                    maxAge: 60 * 60 * 24 * 30, // 30 days
                    path: "/",
                    sameSite: "lax",
                } as any);
                cookie.value = token;
            } catch {
                // if useCookie isn't available (non-Nuxt context), silently ignore
            }
        },

        // Load token from cookie into the store; do NOT restore user from any persistent storage
        loadFromStorage() {
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY);
                this.token = cookie.value ?? null;
                // keep user null — we don't persist user state
            } catch {
                this.token = null;
            }
        },

        // Clear in-memory state and delete token cookie
        logout() {
            this.user = null;
            this.token = null;
            try {
                const cookie = useCookie(COOKIE_TOKEN_KEY);
                cookie.value = null;
            } catch {
                // ignore
            }
        },

        async login(credentials: LoginCredentials) {
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/user/login", {
                    method: "POST",
                    body: credentials,
                });
                if (!data || !data.token)
                    throw new Error("Login response missing token");
                this.setToken(data.token);
                this.user = data.user ?? null; // keep user in memory only
                return data;
            } catch (err: any) {
                // bubble server validation errors where possible
                const message =
                    err?.data?.message ?? err?.message ?? "Login failed";
                throw new Error(message);
            }
        },

        async register(payload: {
            username: string;
            email: string;
            password: string;
        }) {
            const {apiFetch} = useApi();
            try {
                const data = await apiFetch<any>("/user/register", {
                    method: "POST",
                    body: payload,
                });
                if (!data || !data.token)
                    throw new Error("Register response missing token");
                this.setToken(data.token);
                this.user = data.user ?? null;
                return data;
            } catch (err: any) {
                const message =
                    err?.data?.message ?? err?.message ?? "Registration failed";
                throw new Error(message);
            }
        },

        async fetchProfile() {
            if (!this.token) throw new Error("No token available");

            const {apiFetch} = useApi();
            try {
                const user = await apiFetch<User>("/user/me");
                this.user = user;
                return user;
            } catch (err: any) {
                // if unauthorized, clear
                if (err?.status === 401 || err?.response?.status === 401) {
                    this.logout();
                }
                throw new Error(err?.message ?? "Failed fetching profile");
            }
        },

        updateLocalProfile(patch: Partial<User>) {
            if (!this.user && !patch.id) {
                throw new Error("Cannot create user without id");
            }
            this.user = {...this.user, ...patch} as unknown as User;
        },
    },
});
