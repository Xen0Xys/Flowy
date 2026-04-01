<script lang="ts" setup>
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useAuthStore} from "~/stores/auth.store";
import {useUserStore} from "~/stores/user.store";
import {computed, onMounted, ref, watch, watchEffect} from "vue";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
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
            // Properly sequence: await locale change, then clear cookie once
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

const initials = computed(() => {
    const name = userStore.user?.username ?? username.value ?? "";
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase();
    return ((parts[0] || [""])[0] || "" + (parts[1] || [""])[0]).toUpperCase();
});
const avatarUrl = computed(() => userStore.user?.avatar || "");

const effectiveRole = ref("");

async function computeEffectiveRole() {
    if (await userStore.isInstanceOwner) effectiveRole.value = t("profile.roles.instanceOwner");
    else if (userStore.isFamilyAdmin) effectiveRole.value = t("profile.roles.familyAdmin");
    else effectiveRole.value = t("profile.roles.familyMember");
}

const username = ref("");
const email = ref("");
const savingUsername = ref(false);
const savingEmail = ref(false);
const changingPassword = ref(false);

// password fields
const currentPassword = ref("");
const newPassword = ref("");
// delete account
const deleting = ref(false);
const confirmPassword = ref("");

const {apiFetch} = useApi();

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
        // always clear local session
        authStore.logout();
        await useRouter().push("/auth/login");
    } catch (err: any) {
        const message = err?.data?.message ?? err?.message ?? t("profile.errors.deleteAccountFailed");
        toast.error(message);
        throw new Error(message);
    }
}

watchEffect(() => {
    username.value = userStore.user?.username || "";
    email.value = userStore.user?.email || "";
});

onMounted(async () => {
    await computeEffectiveRole();
});

// Recompute role when language changes
watch(locale, async () => {
    await computeEffectiveRole();
});

// instance ownership is fetched alongside profile (see token watcher)

async function saveUsernameOnly() {
    if (!userStore.token) return;
    const nextUsername = username.value.trim();
    if (!isValidUsername(nextUsername)) {
        toast.error(t("profile.errors.usernameLength", {min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH}));
        return;
    }

    savingUsername.value = true;
    try {
        username.value = nextUsername;
        await userStore.saveUsername(nextUsername);
    } finally {
        savingUsername.value = false;
    }
}

async function saveEmailOnly() {
    if (!userStore.token) return;
    const nextEmail = email.value.trim();
    if (!isValidEmail(nextEmail)) {
        toast.error(t("auth.common.errors.invalidEmail"));
        return;
    }

    savingEmail.value = true;
    try {
        email.value = nextEmail;
        await userStore.saveEmail(nextEmail);
    } finally {
        savingEmail.value = false;
    }
}

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
        currentPassword.value = current;
        await userStore.changePassword(current, next);
        // clear on success
        currentPassword.value = "";
        newPassword.value = "";
    } finally {
        changingPassword.value = false;
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-6xl py-6">
            <div class="mb-6">
                <h1 class="text-2xl font-semibold">{{ t("profile.title") }}</h1>
                <p class="text-muted-foreground text-sm">{{ t("profile.description") }}</p>
            </div>

            <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                <aside class="md:col-span-1">
                    <Card class="h-full" innerClass="p-6">
                        <div class="flex flex-col items-center gap-4 text-center">
                            <Avatar class="h-20 w-20 rounded-full">
                                <AvatarImage :alt="userStore.user?.username ?? username" :src="avatarUrl" />
                                <AvatarFallback class="rounded-full text-2xl font-semibold">
                                    {{ initials }}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <div class="text-lg font-medium">
                                    {{ userStore.user?.username ?? username }}
                                </div>
                                <div class="text-muted-foreground text-sm">
                                    {{ userStore.user?.email ?? email }}
                                </div>
                            </div>
                            <p class="text-muted-foreground text-xs">
                                {{ effectiveRole }}
                            </p>
                        </div>
                    </Card>
                </aside>

                <main class="md:col-span-2">
                    <Card class="h-full" innerClass="p-6">
                        <div class="mb-6">
                            <label class="mb-2 block text-sm font-medium">{{ t("profile.username") }}</label>
                            <div class="flex gap-3">
                                <Input
                                    v-model="username"
                                    :aria-label="t('profile.username')"
                                    :placeholder="t('profile.username')"
                                    class="flex-1" />
                                <Button
                                    :disabled="savingUsername || !userStore.token"
                                    aria-label="Save username"
                                    size="sm"
                                    variant="default"
                                    @click="saveUsernameOnly">
                                    <span v-if="!savingUsername">{{ t("profile.save") }}</span>
                                    <span v-else>{{ t("profile.saving") }}</span>
                                </Button>
                            </div>
                        </div>

                        <div class="mb-6">
                            <label class="mb-2 block text-sm font-medium">{{ t("profile.email") }}</label>
                            <div class="flex gap-3">
                                <Input
                                    v-model="email"
                                    :aria-label="t('profile.email')"
                                    :placeholder="t('profile.email')"
                                    class="flex-1"
                                    type="email" />
                                <Button
                                    :disabled="savingEmail || !userStore.token"
                                    aria-label="Save email"
                                    size="sm"
                                    variant="default"
                                    @click="saveEmailOnly">
                                    <span v-if="!savingEmail">{{ t("profile.save") }}</span>
                                    <span v-else>{{ t("profile.saving") }}</span>
                                </Button>
                            </div>
                        </div>

                        <hr class="border-border my-4" />

                        <div class="mb-6">
                            <label class="mb-2 block text-sm font-medium">{{ t("profile.appearance") }}</label>
                            <Select v-model="colorMode.preference">
                                <SelectTrigger class="w-[180px]">
                                    <SelectValue :placeholder="t('profile.selectTheme')" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="system">{{ t("profile.system") }}</SelectItem>
                                        <SelectItem value="light">{{ t("profile.light") }}</SelectItem>
                                        <SelectItem value="dark">{{ t("profile.dark") }}</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        <hr class="border-border my-4" />

                        <div class="mb-6">
                            <label class="mb-2 block text-sm font-medium">{{ t("profile.language") }}</label>
                            <Select v-model="languagePreference">
                                <SelectTrigger class="w-[180px]">
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

                        <hr class="border-border my-4" />

                        <div>
                            <label class="mb-2 block text-sm font-medium">{{ t("profile.changePassword") }}</label>
                            <p class="text-muted-foreground mb-3 text-sm">
                                {{ t("profile.changePasswordDescription") }}
                            </p>
                            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Input
                                    v-model="currentPassword"
                                    :aria-label="t('profile.currentPassword')"
                                    :placeholder="t('profile.currentPassword')"
                                    type="password" />
                                <Input
                                    v-model="newPassword"
                                    :aria-label="t('profile.newPassword')"
                                    :placeholder="t('profile.newPassword')"
                                    type="password" />
                            </div>
                            <div class="mt-4 flex justify-end">
                                <Button
                                    :disabled="changingPassword || !userStore.token || !currentPassword || !newPassword"
                                    aria-label="Change password"
                                    size="sm"
                                    @click="changePasswordNow">
                                    <span v-if="!changingPassword">{{ t("profile.changePasswordButton") }}</span>
                                    <span v-else>{{ t("profile.updating") }}</span>
                                </Button>
                            </div>
                            <hr class="border-border my-4" />
                            <div class="mt-6">
                                <AlertDialog>
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-sm font-medium">{{ t("profile.dangerZone") }}</p>
                                            <p class="text-muted-foreground text-xs">
                                                {{ t("profile.dangerZoneDescription") }}
                                            </p>
                                        </div>
                                        <AlertDialogTrigger>
                                            <Button size="sm" variant="destructive">{{
                                                t("profile.deleteAccount")
                                            }}</Button>
                                        </AlertDialogTrigger>
                                    </div>

                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>{{ t("profile.deleteDialogTitle") }}</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {{ t("profile.deleteDialogDescription") }}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div class="mt-4">
                                            <Input
                                                v-model="confirmPassword"
                                                :aria-label="t('profile.confirmPassword')"
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
                        </div>
                    </Card>
                </main>
            </div>
        </div>
    </div>
</template>
