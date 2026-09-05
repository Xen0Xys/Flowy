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
import {Kbd, KbdGroup} from "~/components/ui/kbd";
import {CATEGORY_ORDER, groupAccountsByType} from "~/utils/accounts";

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

const groupedUserAccounts = computed(() => {
    const groups = groupAccountsByType(userAccounts.value);

    return Object.entries(groups)
        .map(([type, accounts]) => ({
            type,
            accounts: [...accounts].sort((a, b) => b.balance - a.balance),
        }))
        .sort((a, b) => (CATEGORY_ORDER[a.type] ?? 99) - (CATEGORY_ORDER[b.type] ?? 99));
});

function getAccountTypeLabel(type: string) {
    const key = `accounts.types.${type.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? type : translated;
}

const userName = computed(() => userStore.user?.username || t("common.user"));
const userEmail = computed(() => userStore.user?.email || "");
const userAvatar = computed(() => userStore.user?.avatar || "");
const userInitials = computed(() => {
    const source = userStore.user?.username || userStore.user?.email || "U";
    const trimmed = source.trim();
    if (!trimmed) return "U";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const initials =
        parts.length >= 2 ? `${(parts[0] || [""])[0] ?? ""}${(parts[1] || [""])[0] ?? ""}` : `${trimmed[0] ?? "U"}`;
    return initials.toUpperCase();
});

async function computeAdminVisibility() {
    try {
        showAdminLinks.value = await userStore.fetchIsInstanceOwner();
    } catch (err) {
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
    await computeAdminVisibility();
    await loadAccountsForSidebar();
});

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

const commandPaletteOpen = useState<boolean>("commandPalette:open", () => false);
function openCommandPalette() {
    commandPaletteOpen.value = true;
}
const isMac = computed(() => {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
});
</script>

<template>
    <Sidebar class="flowy-sidebar">
        <SidebarHeader class="pb-2">
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton as-child size="lg" class="group/logo">
                        <div>
                            <div class="relative flex aspect-square size-9 items-center justify-center">
                                <span
                                    aria-hidden="true"
                                    class="bg-brand-gradient absolute inset-0 rounded-lg opacity-70 blur-md transition-opacity duration-300 group-hover/logo:opacity-100"></span>
                                <img alt="Flowy Logo" class="relative size-9 rounded-lg" src="/flowy-logo.webp" />
                            </div>
                            <div class="flex flex-col gap-0.5 leading-none">
                                <span class="font-heading text-base font-semibold tracking-tight">Flowy</span>
                                <span class="text-muted-foreground text-[0.7rem] tabular-nums">v{{ version }}</span>
                            </div>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
        <SidebarContent class="gap-2">
            <Transition mode="out-in" name="fade-slide">
                <div v-if="!inSettings" key="main">
                    <SidebarGroup>
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
                                <SidebarMenuItem>
                                    <SidebarMenuButton :is-active="isActiveFunction('/recurring')" as-child>
                                        <NuxtLink to="/recurring">
                                            <Icon name="iconoir:refresh-double"></Icon>
                                            <span>{{ t("sidebar.recurring") }}</span>
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton :is-active="isActiveFunction('/budget')" as-child>
                                        <NuxtLink to="/budget">
                                            <Icon name="iconoir:piggy-bank"></Icon>
                                            <span>{{ t("sidebar.budget") }}</span>
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton :is-active="isActiveFunction('/import')" as-child>
                                        <NuxtLink to="/import">
                                            <Icon name="iconoir:upload"></Icon>
                                            <span>{{ t("sidebar.import") }}</span>
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup v-if="groupedUserAccounts.length">
                        <SidebarGroupLabel>{{ t("sidebar.accounts") }}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <ul :aria-label="t('sidebar.accounts')" class="flex flex-col gap-3">
                                <li v-for="accountGroup in groupedUserAccounts" :key="accountGroup.type">
                                    <section :aria-label="getAccountTypeLabel(accountGroup.type)">
                                        <p
                                            class="text-muted-foreground/80 mb-1 flex items-center gap-2 pl-3 text-[0.68rem] font-medium tracking-[0.08em] uppercase">
                                            {{ getAccountTypeLabel(accountGroup.type) }}
                                            <span
                                                class="bg-sidebar-accent/60 text-muted-foreground/80 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.62rem] tabular-nums">
                                                {{ accountGroup.accounts.length }}
                                            </span>
                                        </p>
                                        <SidebarMenu>
                                            <SidebarMenuItem v-for="account in accountGroup.accounts" :key="account.id">
                                                <SidebarMenuButton
                                                    :is-active="isActiveFunction(`/account/${account.id}`)"
                                                    as-child>
                                                    <NuxtLink :to="`/account/${account.id}`">
                                                        <Icon name="iconoir:wallet"></Icon>
                                                        <span class="truncate">{{ account.name }}</span>
                                                    </NuxtLink>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        </SidebarMenu>
                                    </section>
                                </li>
                            </ul>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </div>

                <div v-else key="settings">
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton as-child>
                                        <NuxtLink to="/" class="text-muted-foreground hover:text-foreground">
                                            <Icon name="iconoir:arrow-left"></Icon>
                                            {{ t("sidebar.backToDashboard") }}
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel>{{ t("sidebar.settings") }}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
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
                                            {{ t("sidebar.family") }}
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        :is-active="isActiveFunction('/settings/user/references')"
                                        as-child>
                                        <NuxtLink to="/settings/user/references">
                                            <Icon name="iconoir:book"></Icon>
                                            {{ t("sidebar.references") }}
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup v-if="showAdminLinks">
                        <SidebarGroupLabel>{{ t("sidebar.instanceManagement") }}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        :is-active="isActiveFunction('/settings/admin/instance')"
                                        as-child>
                                        <NuxtLink to="/settings/admin/instance">
                                            <Icon name="iconoir:server"></Icon>
                                            {{ t("sidebar.instance") }}
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton :is-active="isActiveFunction('/settings/admin/users')" as-child>
                                        <NuxtLink to="/settings/admin/users">
                                            <Icon name="iconoir:user-crown"></Icon>
                                            {{ t("sidebar.users") }}
                                        </NuxtLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </div>
            </Transition>
        </SidebarContent>
        <SidebarFooter>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        :is-active="isActiveFunction('/unknown')"
                        aria-disabled="true"
                        as-child
                        class="opacity-70">
                        <NuxtLink>
                            <Icon name="iconoir:help-circle"></Icon>
                            <span>{{ t("sidebar.getHelp") }}</span>
                            <Badge class="ml-auto" variant="secondary">{{ t("sidebar.wip") }}</Badge>
                        </NuxtLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton @click="openCommandPalette">
                        <Icon name="iconoir:search"></Icon>
                        <span>{{ t("sidebar.search") }}</span>
                        <KbdGroup class="ml-auto">
                            <Kbd>{{ isMac ? "⌘" : "Ctrl" }}</Kbd>
                            <Kbd>K</Kbd>
                        </KbdGroup>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <SidebarMenuButton
                                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group/user"
                                size="lg">
                                <div class="relative">
                                    <span
                                        aria-hidden="true"
                                        class="bg-brand-gradient absolute -inset-0.5 rounded-lg opacity-0 blur-sm transition-opacity duration-300 group-hover/user:opacity-70"></span>
                                    <Avatar class="relative h-8 w-8 rounded-lg ring-1 ring-white/10">
                                        <AvatarImage :alt="userName" :src="userAvatar" />
                                        <AvatarFallback class="bg-brand-gradient-soft rounded-lg text-xs font-medium">
                                            {{ userInitials }}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
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
                                        <AvatarFallback class="bg-brand-gradient-soft rounded-lg text-xs font-medium">
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

<style scoped>
/* Active menu item: soft brand-gradient background + left accent bar */
.flowy-sidebar :deep([data-sidebar="menu-button"][data-active="true"]) {
    position: relative;
    background: var(--brand-gradient-soft);
    color: var(--sidebar-accent-foreground);
    font-weight: 500;
}
.flowy-sidebar :deep([data-sidebar="menu-button"][data-active="true"])::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 999px;
    background: var(--brand-gradient);
    box-shadow: 0 0 12px oklch(0.6 0.18 258 / 0.5);
}
.flowy-sidebar :deep([data-sidebar="menu-button"][data-active="true"]) svg,
.flowy-sidebar :deep([data-sidebar="menu-button"][data-active="true"]) .iconify {
    color: var(--accent);
}

/* Smooth interaction on all sidebar buttons */
.flowy-sidebar :deep([data-sidebar="menu-button"]) {
    transition-property: background-color, color, transform, box-shadow;
    transition-duration: var(--motion-fast);
    transition-timing-function: var(--ease-standard);
}
.flowy-sidebar :deep([data-sidebar="menu-button"]:hover:not([data-active="true"])) {
    background: color-mix(in oklch, var(--sidebar-accent) 60%, transparent);
}
</style>
