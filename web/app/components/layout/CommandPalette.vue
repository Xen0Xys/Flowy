<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useEventListener} from "@vueuse/core";
import {useI18n} from "vue-i18n";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {Kbd, KbdGroup} from "@/components/ui/kbd";
import {useAccountStore} from "~/stores/account.store";
import {useAuthStore} from "~/stores/auth.store";
import {useFamilyStore} from "~/stores/family.store";
import {useUserStore} from "~/stores/user.store";
import {toCurrency} from "~/lib/currency";

const {t, locale, setLocale} = useI18n();
const router = useRouter();
const route = useRoute();
const colorMode = useColorMode();

const accountStore = useAccountStore();
const authStore = useAuthStore();
const familyStore = useFamilyStore();
const userStore = useUserStore();

const open = useState<boolean>("commandPalette:open", () => false);
const showAdminLinks = ref(false);

async function refreshAdminVisibility() {
    if (!userStore.token) {
        showAdminLinks.value = false;
        return;
    }
    try {
        showAdminLinks.value = await userStore.fetchIsInstanceOwner();
    } catch {
        showAdminLinks.value = false;
    }
}

onMounted(refreshAdminVisibility);
watch(() => userStore.token, refreshAdminVisibility);

useEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open.value = !open.value;
    }
});

watch(
    () => route.fullPath,
    () => {
        open.value = false;
    },
);

function run(action: () => void | Promise<void>) {
    open.value = false;
    void action();
}

const accounts = computed(() => accountStore.accounts);
const currency = computed(() => familyStore.family?.currency ?? "USD");

const isDark = computed(() => colorMode.value === "dark");

function toggleTheme() {
    colorMode.preference = isDark.value ? "light" : "dark";
}

async function switchLocale(target: "en" | "fr") {
    await setLocale(target);
}

async function logout() {
    authStore.logout();
    await router.push("/auth/login");
}
</script>

<template>
    <CommandDialog v-model:open="open" :title="t('commandPalette.placeholder')" :description="t('commandPalette.empty')">
        <CommandInput :placeholder="t('commandPalette.placeholder')" />
        <CommandList>
            <CommandEmpty>{{ t("commandPalette.empty") }}</CommandEmpty>

            <CommandGroup :heading="t('commandPalette.groups.navigation')">
                <CommandItem value="nav-dashboard" @select="run(() => router.push('/'))">
                    <Icon name="iconoir:home" />
                    <span>{{ t("commandPalette.actions.dashboard") }}</span>
                </CommandItem>
                <CommandItem value="nav-transactions" @select="run(() => router.push('/transactions'))">
                    <Icon name="iconoir:credit-card" />
                    <span>{{ t("commandPalette.actions.transactions") }}</span>
                </CommandItem>
                <CommandItem value="nav-budget" @select="run(() => router.push('/budget'))">
                    <Icon name="iconoir:piggy-bank" />
                    <span>{{ t("commandPalette.actions.budget") }}</span>
                </CommandItem>
                <CommandItem value="nav-import" @select="run(() => router.push('/import'))">
                    <Icon name="iconoir:upload" />
                    <span>{{ t("commandPalette.actions.import") }}</span>
                </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup :heading="t('commandPalette.groups.quickActions')">
                <CommandItem
                    value="new-transaction"
                    @select="run(() => router.push({path: '/transactions', query: {new: '1'}}))">
                    <Icon name="iconoir:plus" />
                    <span>{{ t("commandPalette.actions.newTransaction") }}</span>
                </CommandItem>
                <CommandItem value="new-account" @select="run(() => router.push({path: '/', query: {new: '1'}}))">
                    <Icon name="iconoir:plus" />
                    <span>{{ t("commandPalette.actions.newAccount") }}</span>
                </CommandItem>
                <CommandItem
                    value="new-budget"
                    @select="run(() => router.push({path: '/budget', query: {...route.query, new: '1'}}))">
                    <Icon name="iconoir:plus" />
                    <span>{{ t("commandPalette.actions.newBudget") }}</span>
                </CommandItem>
                <CommandItem value="import-csv" @select="run(() => router.push('/import'))">
                    <Icon name="iconoir:upload" />
                    <span>{{ t("commandPalette.actions.importCsv") }}</span>
                </CommandItem>
            </CommandGroup>

            <template v-if="accounts.length">
                <CommandSeparator />
                <CommandGroup :heading="t('commandPalette.groups.accounts')">
                    <CommandItem
                        v-for="account in accounts"
                        :key="account.id"
                        :value="`account-${account.id}`"
                        @select="run(() => router.push(`/account/${account.id}`))">
                        <Icon name="iconoir:wallet" />
                        <span class="truncate">{{ account.name }}</span>
                        <span class="text-muted-foreground ml-auto text-xs tabular-nums">
                            {{ toCurrency(account.balance, currency) }}
                        </span>
                    </CommandItem>
                </CommandGroup>
            </template>

            <CommandSeparator />

            <CommandGroup :heading="t('commandPalette.groups.settings')">
                <CommandItem value="settings-profile" @select="run(() => router.push('/settings/user/profile'))">
                    <Icon name="iconoir:user" />
                    <span>{{ t("commandPalette.actions.profile") }}</span>
                </CommandItem>
                <CommandItem value="settings-family" @select="run(() => router.push('/settings/user/family'))">
                    <Icon name="iconoir:community" />
                    <span>{{ t("commandPalette.actions.family") }}</span>
                </CommandItem>
                <CommandItem value="settings-references" @select="run(() => router.push('/settings/user/references'))">
                    <Icon name="iconoir:book" />
                    <span>{{ t("commandPalette.actions.references") }}</span>
                </CommandItem>
            </CommandGroup>

            <template v-if="showAdminLinks">
                <CommandSeparator />
                <CommandGroup :heading="t('commandPalette.groups.admin')">
                    <CommandItem value="admin-instance" @select="run(() => router.push('/settings/admin/instance'))">
                        <Icon name="iconoir:server" />
                        <span>{{ t("commandPalette.actions.instance") }}</span>
                    </CommandItem>
                    <CommandItem value="admin-users" @select="run(() => router.push('/settings/admin/users'))">
                        <Icon name="iconoir:user-crown" />
                        <span>{{ t("commandPalette.actions.users") }}</span>
                    </CommandItem>
                </CommandGroup>
            </template>

            <CommandSeparator />

            <CommandGroup :heading="t('commandPalette.groups.preferences')">
                <CommandItem value="toggle-theme" @select="run(toggleTheme)">
                    <Icon :name="isDark ? 'iconoir:sun-light' : 'iconoir:half-moon'" />
                    <span>
                        {{
                            isDark
                                ? t("commandPalette.actions.toggleThemeLight")
                                : t("commandPalette.actions.toggleThemeDark")
                        }}
                    </span>
                </CommandItem>
                <CommandItem v-if="locale !== 'en'" value="locale-en" @select="run(() => switchLocale('en'))">
                    <Icon name="iconoir:language" />
                    <span>{{ t("commandPalette.actions.switchToEnglish") }}</span>
                </CommandItem>
                <CommandItem v-if="locale !== 'fr'" value="locale-fr" @select="run(() => switchLocale('fr'))">
                    <Icon name="iconoir:language" />
                    <span>{{ t("commandPalette.actions.switchToFrench") }}</span>
                </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup :heading="t('commandPalette.groups.session')">
                <CommandItem value="logout" @select="run(logout)">
                    <Icon name="iconoir:log-out" />
                    <span>{{ t("commandPalette.actions.logout") }}</span>
                </CommandItem>
            </CommandGroup>
        </CommandList>
        <div
            class="border-border/60 text-muted-foreground flex items-center justify-between gap-4 border-t px-3 py-2 text-xs">
            <div class="flex items-center gap-2">
                <KbdGroup>
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                </KbdGroup>
                <span>{{ t("commandPalette.hints.navigate") }}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-1.5">
                    <Kbd>↵</Kbd>
                    <span>{{ t("commandPalette.hints.select") }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <Kbd>Esc</Kbd>
                    <span>{{ t("commandPalette.hints.close") }}</span>
                </div>
            </div>
        </div>
    </CommandDialog>
</template>
