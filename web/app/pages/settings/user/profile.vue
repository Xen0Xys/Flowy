<script lang="ts" setup>
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";
import {computed, onMounted, ref, watch, watchEffect} from "vue";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {useApi} from "@/composables/useApi";
import {toast} from "vue-sonner";
import {useI18n} from "vue-i18n";
import {useRouter} from "#app";
import {cn} from "@/lib/utils";
import {
    isValidEmail,
    isValidPassword,
    isValidUsername,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
} from "@/lib/validation";

const userStore = useUserStore();
const authStore = useAuthStore();
const colorMode = useColorMode();
const {t, locale, locales, setLocale} = useI18n();
const localeCookie = useCookie<string | null>("i18n_redirected");
const {apiFetch} = useApi();

function resolveBrowserLocale(): "en" | "fr" {
    if (process.client) {
        const browserLocales = [...(navigator.languages || []), navigator.language].filter(Boolean);
        for (const browserLocale of browserLocales) {
            const normalizedLocale = browserLocale.toLowerCase();
            if (normalizedLocale.startsWith("fr")) return "fr";
            if (normalizedLocale.startsWith("en")) return "en";
        }
    }

    return "en";
}

const languagePreference = computed<string>({
    get: () => {
        if (localeCookie.value === "en" || localeCookie.value === "fr") {
            return localeCookie.value;
        }

        return "browser";
    },
    set: (value) => {
        if (value === "browser") {
            void (async () => {
                localeCookie.value = null;
                await setLocale(resolveBrowserLocale());
            })();
            return;
        }

        if (value === "en" || value === "fr") {
            void setLocale(value);
        }
    },
});

const availableLocales = computed(() => locales.value.filter((entry) => entry.code === "en" || entry.code === "fr"));

const themeOptions = computed(() => [
    {value: "system", label: t("profile.system"), icon: "iconoir:computer"},
    {value: "light", label: t("profile.light"), icon: "iconoir:sun-light"},
    {value: "dark", label: t("profile.dark"), icon: "iconoir:half-moon"},
]);

const initials = computed(() => {
    const name = (userStore.user?.username ?? username.value ?? "").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
});
const avatarUrl = computed(() => userStore.user?.avatar || "");

const effectiveRole = ref("");
const roleVariant = ref<"default" | "secondary" | "outline">("secondary");

async function computeEffectiveRole() {
    if (await userStore.fetchIsInstanceOwner()) {
        effectiveRole.value = t("profile.roles.instanceOwner");
        roleVariant.value = "default";
    } else if (userStore.isFamilyAdmin) {
        effectiveRole.value = t("profile.roles.familyAdmin");
        roleVariant.value = "secondary";
    } else {
        effectiveRole.value = t("profile.roles.familyMember");
        roleVariant.value = "outline";
    }
}

const username = ref("");
const email = ref("");
const savingAccount = ref(false);

const usernameChanged = computed(() => username.value.trim() !== (userStore.user?.username ?? "").trim());
const emailChanged = computed(() => email.value.trim() !== (userStore.user?.email ?? "").trim());
const accountDirty = computed(() => usernameChanged.value || emailChanged.value);

function resetAccount() {
    username.value = userStore.user?.username || "";
    email.value = userStore.user?.email || "";
}

async function saveAccount() {
    if (!userStore.token) return;
    const nextUsername = username.value.trim();
    const nextEmail = email.value.trim();

    if (usernameChanged.value && !isValidUsername(nextUsername)) {
        toast.error(t("profile.errors.usernameLength", {min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH}));
        return;
    }
    if (emailChanged.value && !isValidEmail(nextEmail)) {
        toast.error(t("auth.common.errors.invalidEmail"));
        return;
    }

    savingAccount.value = true;
    try {
        if (usernameChanged.value) {
            username.value = nextUsername;
            await userStore.saveUsername(nextUsername);
        }
        if (emailChanged.value) {
            email.value = nextEmail;
            await userStore.saveEmail(nextEmail);
        }
    } finally {
        savingAccount.value = false;
    }
}

const currentPassword = ref("");
const newPassword = ref("");
const showNewPassword = ref(false);
const changingPassword = ref(false);

const passwordDirty = computed(() => Boolean(currentPassword.value && newPassword.value));

async function changePasswordNow() {
    if (!userStore.token) return;
    const current = currentPassword.value.trim();
    const next = newPassword.value;

    if (!current || !next) {
        toast.error(t("profile.errors.passwordsRequired"));
        return;
    }

    if (!isValidPassword(next)) {
        toast.error(t("profile.errors.passwordLength", {min: PASSWORD_MIN_LENGTH}));
        return;
    }

    changingPassword.value = true;
    try {
        await userStore.changePassword(current, next);
        currentPassword.value = "";
        newPassword.value = "";
        showNewPassword.value = false;
    } finally {
        changingPassword.value = false;
    }
}

const deleting = ref(false);
const confirmPassword = ref("");

async function deleteAccountNow() {
    if (!userStore.token) return;
    if (!confirmPassword.value.trim()) {
        toast.error(t("profile.errors.currentPasswordRequired"));
        return;
    }
    deleting.value = true;
    try {
        await apiFetch("/user/me", {
            method: "DELETE",
            body: {currentPassword: confirmPassword.value.trim()},
        });
        toast.success(t("profile.toasts.accountDeleted"));
        deleting.value = false;
        authStore.logout();
        await useRouter().push("/auth/login");
    } catch (err: any) {
        const message = err?.data?.message ?? err?.message ?? t("profile.errors.deleteAccountFailed");
        toast.error(message);
        throw new Error(message, {cause: err});
    }
}

watchEffect(() => {
    username.value = userStore.user?.username || "";
    email.value = userStore.user?.email || "";
});

onMounted(async () => {
    await computeEffectiveRole();
});

watch(locale, async () => {
    await computeEffectiveRole();
});
</script>

<template>
    <div class="w-full">
        <div
            class="animate-fade-in-up mx-auto flex w-full max-w-5xl flex-col gap-6 py-6 lg:h-[calc(100dvh-4rem-1.5rem)]">
            <div class="flex shrink-0 items-center gap-3">
                <div class="relative">
                    <span aria-hidden="true" class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                    <div
                        class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                        <Icon class="text-primary size-6" name="iconoir:user" />
                    </div>
                </div>
                <div>
                    <h1 class="font-heading text-2xl font-semibold tracking-tight">{{ t("profile.title") }}</h1>
                    <p class="text-muted-foreground text-sm">{{ t("profile.description") }}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <aside class="lg:col-span-1">
                    <Card>
                        <CardContent class="flex flex-col items-center gap-4 text-center">
                            <Avatar class="h-24 w-24 rounded-full">
                                <AvatarImage :alt="userStore.user?.username ?? username" :src="avatarUrl" />
                                <AvatarFallback class="rounded-full text-2xl font-semibold">
                                    {{ initials }}
                                </AvatarFallback>
                            </Avatar>
                            <div class="min-w-0">
                                <div class="truncate text-lg font-medium">
                                    {{ userStore.user?.username ?? username }}
                                </div>
                                <div class="text-muted-foreground truncate text-sm">
                                    {{ userStore.user?.email ?? email }}
                                </div>
                            </div>
                            <Badge v-if="effectiveRole" :variant="roleVariant">{{ effectiveRole }}</Badge>
                        </CardContent>
                    </Card>
                </aside>

                <main class="lg:col-span-2 lg:min-h-0">
                    <ScrollArea class="lg:h-full">
                        <div class="space-y-6 lg:pr-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{{ t("profile.sections.account") }}</CardTitle>
                                    <CardDescription>{{ t("profile.sections.accountDescription") }}</CardDescription>
                                </CardHeader>
                                <CardContent class="space-y-4">
                                    <div class="space-y-2">
                                        <Label for="profile-username">{{ t("profile.username") }}</Label>
                                        <Input
                                            id="profile-username"
                                            v-model="username"
                                            :placeholder="t('profile.username')" />
                                    </div>
                                    <div class="space-y-2">
                                        <Label for="profile-email">{{ t("profile.email") }}</Label>
                                        <Input
                                            id="profile-email"
                                            v-model="email"
                                            :placeholder="t('profile.email')"
                                            type="email" />
                                    </div>
                                    <div class="flex items-center justify-end gap-2 pt-2">
                                        <Button
                                            v-if="accountDirty"
                                            :disabled="savingAccount"
                                            size="sm"
                                            variant="ghost"
                                            @click="resetAccount">
                                            {{ t("profile.discardChanges") }}
                                        </Button>
                                        <Button
                                            :disabled="!accountDirty || savingAccount || !userStore.token"
                                            size="sm"
                                            @click="saveAccount">
                                            <span v-if="!savingAccount">{{ t("profile.saveChanges") }}</span>
                                            <span v-else>{{ t("profile.saving") }}</span>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{{ t("profile.sections.preferences") }}</CardTitle>
                                    <CardDescription>{{ t("profile.sections.preferencesDescription") }}</CardDescription>
                                </CardHeader>
                                <CardContent class="space-y-6">
                                    <div class="space-y-2">
                                        <Label>{{ t("profile.appearance") }}</Label>
                                        <div class="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
                                            <button
                                                v-for="opt in themeOptions"
                                                :key="opt.value"
                                                type="button"
                                                :class="
                                                    cn(
                                                        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-initial',
                                                        colorMode.preference === opt.value
                                                            ? 'bg-background text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground',
                                                    )
                                                "
                                                @click="colorMode.preference = opt.value">
                                                <Icon :name="opt.icon" class="size-4" />
                                                <span>{{ opt.label }}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <Label for="profile-language">{{ t("profile.language") }}</Label>
                                        <Select v-model="languagePreference">
                                            <SelectTrigger id="profile-language" class="w-full sm:max-w-xs">
                                                <SelectValue :placeholder="t('profile.selectLanguage')" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    <SelectItem value="browser">{{ t("profile.browser") }}</SelectItem>
                                                    <SelectItem
                                                        v-for="availableLocale in availableLocales"
                                                        :key="availableLocale.code"
                                                        :value="availableLocale.code">
                                                        {{ availableLocale.name }}
                                                    </SelectItem>
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{{ t("profile.sections.security") }}</CardTitle>
                                    <CardDescription>{{ t("profile.changePasswordDescription") }}</CardDescription>
                                </CardHeader>
                                <CardContent class="space-y-4">
                                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div class="space-y-2">
                                            <Label for="profile-current-password">{{
                                                t("profile.currentPassword")
                                            }}</Label>
                                            <Input
                                                id="profile-current-password"
                                                v-model="currentPassword"
                                                :placeholder="t('profile.currentPassword')"
                                                type="password" />
                                        </div>
                                        <div class="space-y-2">
                                            <Label for="profile-new-password">{{ t("profile.newPassword") }}</Label>
                                            <div class="relative">
                                                <Input
                                                    id="profile-new-password"
                                                    v-model="newPassword"
                                                    :placeholder="t('profile.newPassword')"
                                                    :type="showNewPassword ? 'text' : 'password'"
                                                    class="pr-10" />
                                                <Button
                                                    :aria-label="
                                                        showNewPassword
                                                            ? t('settings.users.hidePassword')
                                                            : t('settings.users.showPassword')
                                                    "
                                                    class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                    @click="showNewPassword = !showNewPassword">
                                                    <Icon
                                                        :name="showNewPassword ? 'iconoir:eye-closed' : 'iconoir:eye'"
                                                        class="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex justify-end pt-2">
                                        <Button
                                            :disabled="!passwordDirty || changingPassword || !userStore.token"
                                            size="sm"
                                            @click="changePasswordNow">
                                            <span v-if="!changingPassword">{{ t("profile.changePasswordButton") }}</span>
                                            <span v-else>{{ t("profile.updating") }}</span>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card class="border-destructive/40">
                                <CardHeader>
                                    <CardTitle class="text-destructive flex items-center gap-2">
                                        <Icon class="size-5" name="iconoir:warning-triangle" />
                                        {{ t("profile.dangerZone") }}
                                    </CardTitle>
                                    <CardDescription>{{ t("profile.dangerZoneDescription") }}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                                        <div class="text-sm">
                                            <p class="font-medium">{{ t("profile.deleteAccount") }}</p>
                                            <p class="text-muted-foreground text-xs">
                                                {{ t("profile.deleteDialogDescription") }}
                                            </p>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" variant="destructive">
                                                    {{ t("profile.deleteAccount") }}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>{{
                                                        t("profile.deleteDialogTitle")
                                                    }}</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {{ t("profile.deleteDialogDescription") }}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <div class="space-y-2">
                                                    <Label for="profile-confirm-password">
                                                        {{ t("profile.confirmPassword") }}
                                                    </Label>
                                                    <Input
                                                        id="profile-confirm-password"
                                                        v-model="confirmPassword"
                                                        :placeholder="t('profile.currentPassword')"
                                                        type="password" />
                                                </div>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{{ t("profile.cancel") }}</AlertDialogCancel>
                                                    <AlertDialogAction :disabled="deleting" @click="deleteAccountNow">
                                                        <span v-if="!deleting">{{ t("profile.delete") }}</span>
                                                        <span v-else>{{ t("profile.deleting") }}</span>
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                </main>
            </div>
        </div>
    </div>
</template>
