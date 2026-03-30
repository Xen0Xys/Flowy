import {computed} from "vue";
import {useRoute} from "vue-router";
import {useI18n} from "vue-i18n";
import {useAccountStore} from "~/stores/account.store";

export type BreadcrumbItem = {
    label: string;
    href?: string;
    icon?: string;
};

export function useBreadcrumbs() {
    const route = useRoute();
    const accountStore = useAccountStore();
    const {t} = useI18n();

    const breadcrumbs = computed<BreadcrumbItem[]>(() => {
        const path = route.path;
        const segments = path.split("/").filter(Boolean);

        const items: BreadcrumbItem[] = [];

        if (path === "/") {
            return items;
        }

        if (path === "/import") {
            items.push({label: t("breadcrumbs.transactions"), href: "/transactions", icon: "iconoir:credit-card"});
            items.push({label: t("breadcrumbs.import"), icon: "iconoir:upload"});
            return items;
        }

        if (path.startsWith("/transactions")) {
            items.push({label: t("breadcrumbs.transactions"), href: "/transactions", icon: "iconoir:credit-card"});
            return items;
        }

        if (path.startsWith("/account/")) {
            const accountId = segments[1];
            const account = accountStore.accounts.find((a) => a.id === accountId);
            items.push({label: t("breadcrumbs.accounts"), href: "/", icon: "iconoir:wallet"});
            items.push({label: account?.name ?? t("breadcrumbs.account")});
            return items;
        }

        if (path.startsWith("/settings/admin")) {
            items.push({label: t("breadcrumbs.settings"), href: "/settings/user/profile", icon: "iconoir:settings"});
            const subSegment = segments[2];
            if (subSegment === "instance") {
                items.push({label: t("breadcrumbs.instance")});
            } else if (subSegment === "users") {
                items.push({label: t("breadcrumbs.users")});
            }
            return items;
        }

        if (path.startsWith("/settings/user")) {
            items.push({label: t("breadcrumbs.settings"), href: "/settings/user/profile", icon: "iconoir:settings"});
            const subSegment = segments[2];
            if (subSegment === "profile") {
                items.push({label: t("breadcrumbs.profile")});
            } else if (subSegment === "family") {
                items.push({label: t("breadcrumbs.family")});
            } else if (subSegment === "references") {
                items.push({label: t("breadcrumbs.references")});
            }
            return items;
        }

        return items;
    });

    return {breadcrumbs};
}
