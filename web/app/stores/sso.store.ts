import {defineStore} from "pinia";
import {toast} from "vue-sonner";
import {useApi} from "~/composables/useApi";
import {i18nT} from "~/utils/i18n";

export type SsoPublicProvider = {
    slug: string;
    displayName: string;
    icon: string;
};

export type SsoIdentity = {
    id: string;
    providerSlug: string;
    providerDisplayName: string;
    providerIcon: string;
    emailAtLink: string | null;
    linkedAt: string;
    lastLoginAt: string | null;
};

export type SsoAdminProvider = {
    slug: string;
    displayName: string;
    icon: string;
    kind: "oidc" | "oauth2";
    scopes: string[];
    allowSignup: boolean;
    allowedEmailDomains: string[];
    discoveryUrl?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userinfoUrl?: string;
    emailsUrl?: string;
    callbackUrl: string;
};

export const useSsoStore = defineStore("sso", {
    state: () => ({
        providers: [] as SsoPublicProvider[],
        providersLoaded: false,
        identities: [] as SsoIdentity[],
        identitiesLoaded: false,
        adminProviders: [] as SsoAdminProvider[],
        adminProvidersLoaded: false,
    }),

    actions: {
        async fetchProviders(force = false): Promise<SsoPublicProvider[]> {
            if (!force && this.providersLoaded) return this.providers;
            const {apiFetch} = useApi();
            try {
                const providers = await apiFetch<SsoPublicProvider[]>("/auth/sso/providers");
                this.providers = providers ?? [];
                this.providersLoaded = true;
                return this.providers;
            } catch {
                this.providers = [];
                this.providersLoaded = true;
                return [];
            }
        },

        async fetchIdentities(force = false): Promise<SsoIdentity[]> {
            if (!force && this.identitiesLoaded) return this.identities;
            const {apiFetch} = useApi();
            try {
                const identities = await apiFetch<SsoIdentity[]>("/auth/sso/identities");
                this.identities = identities ?? [];
                this.identitiesLoaded = true;
                return this.identities;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("sso.errors.listIdentities");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async unlinkIdentity(id: string): Promise<void> {
            const {apiFetch} = useApi();
            try {
                await apiFetch(`/auth/sso/identities/${id}`, {method: "DELETE"});
                this.identities = this.identities.filter((identity) => identity.id !== id);
                toast.success(i18nT("sso.toasts.unlinked"));
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("sso.errors.unlink");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        buildLoginStartUrl(slug: string): string {
            const config = useRuntimeConfig?.() ?? null;
            const base = (config?.public?.apiBase as string | undefined) ?? "";
            return `${base}/auth/sso/${encodeURIComponent(slug)}/start`;
        },

        async requestLinkStartUrl(slug: string): Promise<string> {
            const {apiFetch} = useApi();
            try {
                const response = await apiFetch<{url: string}>(`/auth/sso/${encodeURIComponent(slug)}/link/start`, {
                    method: "POST",
                });
                if (!response?.url) throw new Error(i18nT("sso.errors.internal"));
                return response.url;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("sso.errors.internal");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },

        async fetchAdminProviders(force = false): Promise<SsoAdminProvider[]> {
            if (!force && this.adminProvidersLoaded) return this.adminProviders;
            const {apiFetch} = useApi();
            try {
                const providers = await apiFetch<SsoAdminProvider[]>("/admin/sso/providers");
                this.adminProviders = providers ?? [];
                this.adminProvidersLoaded = true;
                return this.adminProviders;
            } catch (err: any) {
                const message = err?.data?.message ?? err?.message ?? i18nT("sso.errors.listAdminProviders");
                toast.error(message);
                throw new Error(message, {cause: err});
            }
        },
    },
});
