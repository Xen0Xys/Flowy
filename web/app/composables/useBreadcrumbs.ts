import {computed} from "vue";
import {useRoute} from "vue-router";
import {useAccountStore} from "~/stores/account.store";

export type BreadcrumbItem = {
    label: string;
    href?: string;
    icon?: string;
};

export function useBreadcrumbs() {
    const route = useRoute();
    const accountStore = useAccountStore();

    const breadcrumbs = computed<BreadcrumbItem[]>(() => {
        const path = route.path;
        const segments = path.split("/").filter(Boolean);

        const items: BreadcrumbItem[] = [];

        if (path === "/") {
            return items;
        }

        if (path.startsWith("/transactions")) {
            items.push({label: "Transactions", href: "/transactions", icon: "iconoir:credit-card"});
            return items;
        }

        if (path.startsWith("/account/")) {
            const accountId = segments[1];
            const account = accountStore.accounts.find((a) => a.id === accountId);
            items.push({label: "Accounts", href: "/", icon: "iconoir:wallet"});
            items.push({label: account?.name ?? "Account"});
            return items;
        }

        if (path.startsWith("/settings/admin")) {
            items.push({label: "Settings", href: "/settings/user/profile", icon: "iconoir:settings"});
            const subSegment = segments[2];
            if (subSegment === "instance") {
                items.push({label: "Instance"});
            } else if (subSegment === "users") {
                items.push({label: "Users"});
            }
            return items;
        }

        if (path.startsWith("/settings/user")) {
            items.push({label: "Settings", href: "/settings/user/profile", icon: "iconoir:settings"});
            const subSegment = segments[2];
            if (subSegment === "profile") {
                items.push({label: "Profile"});
            } else if (subSegment === "family") {
                items.push({label: "Family"});
            } else if (subSegment === "references") {
                items.push({label: "References"});
            }
            return items;
        }

        return items;
    });

    return {breadcrumbs};
}
