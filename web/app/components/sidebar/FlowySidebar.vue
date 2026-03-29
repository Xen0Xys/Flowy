<script lang="ts" setup>
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "~/components/ui/sidebar";
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "~/stores/user.store";
import {useAuthStore} from "~/stores/auth.store";
import {useAccountStore} from "~/stores/account.store";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Badge} from "~/components/ui/badge";

const route = useRoute();
const {t} = useI18n();
const isActiveFunction = (path: string) => route.path === path;
const inSettings = computed(() => route.path.startsWith("/settings"));

const config = useRuntimeConfig();
const version = computed(() => {
    return config.public.appVersion as string;
});

// show/hide instance/admin settings links depending on permissions
const userStore = useUserStore();
const authStore = useAuthStore();
const accountStore = useAccountStore();
const showAdminLinks = ref(false);
const {isMobile} = useSidebar();
const userAccounts = computed(() => accountStore.accounts);

const userName = computed(() => userStore.user?.username || t("common.user"));
const userEmail = computed(() => userStore.user?.email || "");
const userAvatar = computed(() => userStore.user?.avatar || "");
const userInitials = computed(() => {
    const source = userStore.user?.username || userStore.user?.email || "U";
    const trimmed = source.trim();
    if (!trimmed) return "U";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2 ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}` : `${trimmed[0] ?? "U"}`;
    return initials.toUpperCase();
});

async function computeAdminVisibility() {
    try {
        // the store getter is async and may call the admin endpoint
        // await the result and update local state
        showAdminLinks.value = await userStore.isInstanceOwner;
    } catch (err) {
        // if any error occurs, be conservative and hide admin links
        showAdminLinks.value = false;
    }
}

async function loadAccountsForSidebar() {
    if (!userStore.token || userAccounts.value.length > 0) return;

    try {
        await accountStore.fetchAccounts();
    } catch {
        // ignore sidebar-only account loading errors
    }
}

onMounted(async () => {
    // compute once on client mount
    await computeAdminVisibility();
    await loadAccountsForSidebar();
});

// recompute when token changes (login/logout)
watch(
    () => userStore.token,
    async (token) => {
        if (token) {
            await Promise.all([computeAdminVisibility(), loadAccountsForSidebar()]);
        } else {
            showAdminLinks.value = false;
        }
    },
);

async function handleLogout() {
    authStore.logout();
    await useRouter().push("/auth/login");
}
</script>

<template>
    <Sidebar>
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton as-child size="lg">
                        <div>
                            <div class="flex aspect-square size-8 items-center justify-center rounded-lg">
                                <img alt="Flowy Logo" class="size-8" src="/flowy-logo.webp" />
                            </div>
                            <div class="flex flex-col gap-0.5 leading-none">
                                <span class="font-semibold">Flowy</span>
                                <span class="text-muted-foreground text-xs">{{ version }}</span>
                            </div>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup :aria-hidden="inSettings" :class="{hidden: inSettings}">
                <SidebarGroupLabel>{{ t("sidebar.menu") }}</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/')" as-child>
                                <NuxtLink to="/">
                                    <Icon name="iconoir:home"></Icon>
                                    <span>{{ t("sidebar.dashboard") }}</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/transactions')" as-child>
                                <NuxtLink to="/transactions">
                                    <Icon name="iconoir:credit-card"></Icon>
                                    <span>{{ t("sidebar.transactions") }}</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
                <SidebarGroupLabel v-if="userAccounts.length">{{ t("sidebar.accounts") }}</SidebarGroupLabel>
                <SidebarGroupContent v-if="userAccounts.length">
                    <SidebarMenu>
                        <SidebarMenuItem v-for="account in userAccounts" :key="account.id">
                            <SidebarMenuButton :is-active="isActiveFunction(`/account/${account.id}`)" as-child>
                                <NuxtLink :to="`/account/${account.id}`">
                                    <Icon name="iconoir:wallet"></Icon>
                                    <span>{{ account.name }}</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup :aria-hidden="!inSettings" :class="{hidden: !inSettings}">
                <SidebarGroupLabel>{{ t("sidebar.dashboard") }}</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <!-- User settings category -->
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/')" as-child>
                                <NuxtLink to="/">
                                    <Icon name="iconoir:arrow-left"></Icon>
                                    {{ t("sidebar.backToDashboard") }}
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
                <SidebarGroupLabel>{{ t("sidebar.settings") }}</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <!-- User settings category -->
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/settings/user/profile')" as-child>
                                <NuxtLink to="/settings/user/profile">
                                    <Icon name="iconoir:user"></Icon>
                                    {{ t("sidebar.profile") }}
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/settings/user/family')" as-child>
                                <NuxtLink to="/settings/user/family">
                                    <Icon name="iconoir:community"></Icon>
                                    {{ t("sidebar.family") }}</NuxtLink
                                >
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton :is-active="isActiveFunction('/settings/user/references')" as-child>
                                <NuxtLink to="/settings/user/references">
                                    <Icon name="iconoir:book"></Icon>
                                    {{ t("sidebar.references") }}</NuxtLink
                                >
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
                <SidebarGroupLabel v-if="showAdminLinks">{{ t("sidebar.instanceManagement") }}</SidebarGroupLabel>
                <SidebarGroupContent v-if="showAdminLinks">
                    <SidebarMenuItem>
                        <SidebarMenuButton :is-active="isActiveFunction('/settings/admin/instance')" as-child>
                            <NuxtLink to="/settings/admin/instance">
                                <Icon name="iconoir:server"></Icon>
                                {{ t("sidebar.instance") }}</NuxtLink
                            >
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton :is-active="isActiveFunction('/settings/admin/users')" as-child>
                            <NuxtLink to="/settings/admin/users">
                                <Icon name="iconoir:user-crown"></Icon>
                                {{ t("sidebar.users") }}</NuxtLink
                            >
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton :is-active="isActiveFunction('/unknown')" aria-disabled="true" as-child>
                        <NuxtLink>
                            <Icon name="iconoir:help-circle"></Icon>
                            <span>{{ t("sidebar.getHelp") }}</span>
                            <Badge class="ml-auto" variant="secondary">{{ t("sidebar.wip") }}</Badge>
                        </NuxtLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton :is-active="isActiveFunction('/unknown')" aria-disabled="true" as-child>
                        <NuxtLink>
                            <Icon name="iconoir:search"></Icon>
                            <span>{{ t("sidebar.search") }}</span>
                            <Badge class="ml-auto" variant="secondary">{{ t("sidebar.wip") }}</Badge>
                        </NuxtLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <SidebarMenuButton
                                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                size="lg">
                                <Avatar class="h-8 w-8 rounded-lg">
                                    <AvatarImage :alt="userName" :src="userAvatar" />
                                    <AvatarFallback class="rounded-lg">
                                        {{ userInitials }}
                                    </AvatarFallback>
                                </Avatar>
                                <div class="grid flex-1 text-left text-sm leading-tight">
                                    <span class="truncate font-medium">
                                        {{ userName }}
                                    </span>
                                    <span class="text-muted-foreground truncate text-xs">
                                        {{ userEmail }}
                                    </span>
                                </div>
                                <Icon class="ml-auto size-4" name="iconoir:nav-arrow-down" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            :side="isMobile ? 'bottom' : 'right'"
                            :side-offset="4"
                            align="end"
                            class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg">
                            <DropdownMenuLabel class="p-0 font-normal">
                                <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                    <Avatar class="h-8 w-8 rounded-lg">
                                        <AvatarImage :alt="userName" :src="userAvatar" />
                                        <AvatarFallback class="rounded-lg">
                                            {{ userInitials }}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div class="grid flex-1 text-left text-sm leading-tight">
                                        <span class="truncate font-medium">
                                            {{ userName }}
                                        </span>
                                        <span class="text-muted-foreground truncate text-xs">
                                            {{ userEmail }}
                                        </span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem as-child>
                                    <NuxtLink to="/settings/user/profile">
                                        <Icon name="iconoir:settings" />
                                        {{ t("common.settings") }}
                                    </NuxtLink>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem @click="handleLogout">
                                <Icon name="iconoir:log-out" />
                                {{ t("sidebar.logOut") }}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    </Sidebar>
</template>

<style scoped></style>
