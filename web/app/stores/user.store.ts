import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";

export type User = {
    id: string;
    username: string;
    email: string;
    jwtId?: string;
    familyId?: string | null;
    familyRole?: string | null;
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
        hasFamily: (state) => !!state.user?.familyId,
        getUser: (state) => state.user,
        getToken: (state) => state.token,
        isFamilyAdmin: (state) => state.user?.familyRole === "ADMIN",
        isInstanceOwner: async (state) => {
            const {apiFetch} = useApi();
            try {
                await apiFetch("/admin/instance/settings");
                return true;
            } catch (err: any) {
                if (err?.status === 403 || err?.response?.status === 403) {
                    return false;
                }
                throw err;
            }
        },
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
                if (!data || !data.token) {
                    toast.error(
                        "Registration failed: missing token from server",
                    );
                    throw new Error("Register response missing token");
                }
                this.setToken(data.token);
                this.user = data.user ?? null; // keep user in memory only
                toast.success("Connected");
                return data;
            } catch (err: any) {
                // bubble server validation errors where possible
                const message =
                    err?.data?.message ?? err?.message ?? "Login failed";
                toast.error(message);
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
                if (!data || !data.token) {
                    toast.error(
                        "Registration failed: missing token from server",
                    );
                    throw new Error("Register response missing token");
                }
                this.setToken(data.token);
                this.user = data.user ?? null;
                toast.success("Account created");
                return data;
            } catch (err: any) {
                const message =
                    err?.data?.message ?? err?.message ?? "Registration failed";
                toast.error(message);
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
                    toast.info("Session expired. Please log in again.");
                }
                const message = err?.message ?? "Failed fetching profile";
                toast.error(message);
                throw new Error(message);
            }
        },

        async saveUsername(newUsername: string) {
            if (!this.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updatedUser = await apiFetch<User>("/user/me/username", {
                    method: "PATCH",
                    body: {username: newUsername},
                });
                this.user = updatedUser;
                toast.success("Username updated");
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating username";
                toast.error(message);
                throw new Error(message);
            }
        },

        async saveEmail(newEmail: string) {
            if (!this.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                const updatedUser = await apiFetch<User>("/user/me/email", {
                    method: "PATCH",
                    body: {email: newEmail},
                });
                this.user = updatedUser;
                toast.success("Email updated");
                return updatedUser;
            } catch (err: any) {
                const message = err?.message ?? "Failed updating email";
                toast.error(message);
                throw new Error(message);
            }
        },

        async changePassword(currentPassword: string, newPassword: string) {
            if (!this.token) throw new Error("No token available");
            const {apiFetch} = useApi();
            try {
                await apiFetch("/user/me/password", {
                    method: "PATCH",
                    body: {
                        currentPassword,
                        newPassword,
                    },
                });
                toast.success("Password updated");
            } catch (err: any) {
                const message = err?.message ?? "Failed updating password";
                toast.error(message);
                throw new Error(message);
            }
        },
    },
});
