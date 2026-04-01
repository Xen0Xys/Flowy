<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "~/stores/user.store";
import {useFamilyStore} from "~/stores/family.store";
import {toast} from "vue-sonner";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useClipboard} from "@vueuse/core";
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
import {useRouter} from "#app";
import {isValidCurrencyCode, isValidEmail, isValidFamilyName, normalizeCurrencyCode} from "@/lib/validation";
import {CURRENCY_LOCALES_MAP} from "~/lib/currency";

const userStore = useUserStore();
const familyStore = useFamilyStore();
const {t} = useI18n();

type Family = {
    name: string;
    currency: string;
    owner: any;
    members?: any[];
};

const family = ref<Family | null>(null);
const invites = ref<any[]>([]);

const loading = ref(false);
const familyLoaded = ref(false);
const inviting = ref(false);

const inviteEmail = ref("");

const editFamilyName = ref("");
const editFamilyCurrency = ref("");
const savingFamilyName = ref(false);
const savingFamilyCurrency = ref(false);

const removingMemberId = ref<string | null>(null);
const familyActionLoading = ref(false);
const currencyOptions = Object.keys(CURRENCY_LOCALES_MAP);
const familyRoleLabel = computed(() => {
    if (!family.value || !userStore.user?.id) return t("settings.family.member");
    if (family.value.owner?.id === userStore.user.id) return t("settings.family.owner");
    return userStore.isFamilyAdmin ? t("settings.family.admin") : t("settings.family.member");
});

const canSaveFamilyName = computed(() => {
    if (!userStore.isFamilyAdmin) return false;
    if (!family.value) return false;

    const nextName = editFamilyName.value.trim();

    return Boolean(nextName) && nextName !== family.value.name;
});

const canSaveFamilyCurrency = computed(() => {
    if (!userStore.isFamilyAdmin) return false;
    if (!family.value) return false;

    const nextCurrency = normalizeCurrencyCode(editFamilyCurrency.value);
    const currentCurrency = normalizeCurrencyCode(family.value.currency);

    return Boolean(nextCurrency) && nextCurrency !== currentCurrency;
});

async function loadFamily() {
    if (!userStore.token) return;
    familyLoaded.value = false;
    loading.value = true;
    try {
        family.value = await familyStore.fetchFamily();
        if (family.value) {
            editFamilyName.value = family.value.name;
            editFamilyCurrency.value = family.value.currency;
        }
        if (userStore.isFamilyAdmin) invites.value = await familyStore.getInvites();
    } catch (err) {
        // errors are handled in the store (toasts)
    } finally {
        loading.value = false;
        familyLoaded.value = true;
    }
}

async function handleInvite() {
    if (!userStore.token) return;
    const nextInviteEmail = inviteEmail.value.trim();
    if (!nextInviteEmail) {
        toast.error(t("auth.common.errors.emailRequired"));
        return;
    }

    if (!isValidEmail(nextInviteEmail)) {
        toast.error(t("auth.common.errors.invalidEmail"));
        return;
    }

    inviting.value = true;
    try {
        await familyStore.inviteMember(nextInviteEmail);
        inviteEmail.value = "";
        invites.value = await familyStore.getInvites();
    } finally {
        inviting.value = false;
    }
}

async function handleRevoke(code: string) {
    if (!userStore.token) return;
    try {
        await familyStore.revokeInvite(code);
        invites.value = await familyStore.getInvites();
    } catch (err) {
        // store will toast
    }
}

async function copyInviteCode(code: string) {
    try {
        const {copy} = useClipboard();
        await copy(code);
        toast.success(t("settings.family.toasts.inviteCodeCopied"));
    } catch (err) {
        toast.error(t("settings.family.errors.copyInviteFailed"));
        throw err;
    }
}

async function handleDeleteFamily() {
    if (!userStore.token || !userStore.isFamilyAdmin) return;
    familyActionLoading.value = true;
    try {
        await familyStore.deleteFamily();
        family.value = null;
        await useRouter().push({path: "/onboarding/select"});
    } catch (err) {
        // store will toast
    } finally {
        familyActionLoading.value = false;
    }
}

async function handleLeaveFamily() {
    if (!userStore.token) return;
    familyActionLoading.value = true;
    try {
        await familyStore.quitFamily();
        family.value = null;
        await useRouter().push({path: "/onboarding/select"});
    } catch (err) {
        // store will toast
    } finally {
        familyActionLoading.value = false;
    }
}

async function saveFamilyNameOnly() {
    if (!userStore.token || !userStore.isFamilyAdmin) return;
    const name = editFamilyName.value.trim();

    if (!family.value) return;

    if (name === family.value.name) {
        return;
    }

    if (!name) {
        toast.error(t("settings.family.errors.nameRequired"));
        return;
    }

    if (!isValidFamilyName(name)) {
        toast.error(t("settings.family.errors.nameLength"));
        return;
    }

    savingFamilyName.value = true;
    try {
        await familyStore.updateFamilySettings({name});
        editFamilyName.value = name;
        await loadFamily();
    } finally {
        savingFamilyName.value = false;
    }
}

async function saveFamilyCurrencyOnly() {
    if (!userStore.token || !userStore.isFamilyAdmin) return;
    const currency = normalizeCurrencyCode(editFamilyCurrency.value);

    if (!family.value) return;

    const currentCurrency = normalizeCurrencyCode(family.value.currency);
    if (currency === currentCurrency) {
        return;
    }

    if (!isValidCurrencyCode(currency)) {
        toast.error(t("settings.family.errors.currencyInvalid"));
        return;
    }

    savingFamilyCurrency.value = true;
    try {
        await familyStore.updateFamilySettings({currency});
        editFamilyCurrency.value = currency;
        await loadFamily();
    } finally {
        savingFamilyCurrency.value = false;
    }
}

onMounted(async () => {
    await loadFamily();
});

async function removeMember(id: string) {
    if (!userStore.token) return;
    if (!userStore.isFamilyAdmin) return;
    try {
        removingMemberId.value = id;
        await familyStore.removeFamilyMember(id);
        // refresh local list
        family.value = await familyStore.fetchFamily();
        invites.value = await familyStore.getInvites();
    } catch (err) {
        // store will toast
    } finally {
        removingMemberId.value = null;
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-6xl py-6">
            <div class="mb-6">
                <h1 class="text-2xl font-semibold">{{ t("settings.family.title") }}</h1>
                <p class="text-muted-foreground text-sm">{{ t("settings.family.subtitle") }}</p>
            </div>

            <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                <aside class="md:col-span-1">
                    <Card class="h-full" innerClass="p-6">
                        <div class="flex flex-col items-center gap-4 text-center">
                            <div v-if="!familyLoaded || loading" class="w-full space-y-4">
                                <Skeleton class="mx-auto h-5 w-32" />
                                <Skeleton class="mx-auto h-4 w-24" />
                            </div>

                            <template v-else-if="family">
                                <div>
                                    <div class="text-lg font-medium">
                                        {{ family.name }}
                                    </div>
                                    <div class="text-muted-foreground text-sm">
                                        {{ t("settings.family.memberCount", family.members?.length ?? 0) }}
                                    </div>
                                </div>

                                <p class="text-muted-foreground text-xs">
                                    {{ familyRoleLabel }}
                                </p>

                                <hr class="border-border w-full" />

                                <AlertDialog>
                                    <div class="flex w-full items-center justify-between">
                                        <div class="text-left">
                                            <p class="text-sm font-medium">{{ t("profile.dangerZone") }}</p>
                                            <p class="text-muted-foreground text-xs">
                                                {{
                                                    userStore.isFamilyAdmin
                                                        ? t("settings.family.deleteThis")
                                                        : t("settings.family.leaveThis")
                                                }}
                                            </p>
                                        </div>
                                        <AlertDialogTrigger asChild>
                                            <Button size="sm" variant="destructive">
                                                {{
                                                    userStore.isFamilyAdmin
                                                        ? t("common.delete")
                                                        : t("settings.family.leave")
                                                }}
                                            </Button>
                                        </AlertDialogTrigger>
                                    </div>

                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                {{
                                                    userStore.isFamilyAdmin
                                                        ? t("settings.family.deleteFamily")
                                                        : t("settings.family.leaveFamily")
                                                }}
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                <template v-if="userStore.isFamilyAdmin">
                                                    {{ t("settings.family.deleteFamilyDescription") }}
                                                </template>
                                                <template v-else>
                                                    {{ t("settings.family.leaveFamilyDescription") }}
                                                </template>
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                            <AlertDialogAction
                                                :disabled="familyActionLoading"
                                                @click="
                                                    userStore.isFamilyAdmin ? handleDeleteFamily() : handleLeaveFamily()
                                                ">
                                                <span v-if="!familyActionLoading">
                                                    {{
                                                        userStore.isFamilyAdmin
                                                            ? t("common.delete")
                                                            : t("settings.family.leave")
                                                    }}
                                                </span>
                                                <span v-else>{{ t("common.processing") }}</span>
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </template>

                            <p v-else class="text-muted-foreground text-sm">{{ t("settings.family.unableToLoad") }}</p>
                        </div>
                    </Card>
                </aside>

                <main class="md:col-span-2">
                    <Card class="h-full" innerClass="p-6">
                        <div v-if="!familyLoaded || loading">
                            <div class="space-y-4">
                                <Skeleton class="h-6 w-40" />
                                <Skeleton class="h-4 w-64" />
                                <div class="space-y-2">
                                    <Skeleton class="h-4 w-28" />
                                    <Skeleton class="h-10 w-full" />
                                    <Skeleton class="h-10 w-full" />
                                </div>
                                <div class="space-y-2">
                                    <Skeleton class="h-4 w-32" />
                                    <Skeleton class="h-10 w-full" />
                                    <Skeleton class="h-10 w-full" />
                                </div>
                            </div>
                        </div>

                        <div v-else>
                            <section v-if="family">
                                <h3 class="mb-2 text-lg font-medium">{{ t("settings.family.info") }}</h3>
                                <div class="text-muted-foreground mb-4 text-sm">
                                    {{ t("settings.family.owner") }}: {{ family.owner?.username }} ({{
                                        family.owner?.email
                                    }})
                                </div>

                                <h4 class="mb-2 font-medium">{{ t("settings.family.settings") }}</h4>
                                <div class="mb-6 space-y-4">
                                    <div>
                                        <label class="mb-2 block text-sm font-medium">{{
                                            t("settings.family.familyName")
                                        }}</label>
                                        <div class="flex gap-3">
                                            <Input
                                                v-model="editFamilyName"
                                                :disabled="!userStore.isFamilyAdmin"
                                                :aria-label="t('settings.family.familyName')"
                                                class="flex-1"
                                                :placeholder="t('settings.family.familyName')" />
                                            <Button
                                                :disabled="savingFamilyName || !canSaveFamilyName"
                                                :aria-label="t('settings.family.aria.saveFamilyName')"
                                                size="sm"
                                                variant="default"
                                                @click="saveFamilyNameOnly">
                                                <span v-if="!savingFamilyName">{{ t("common.save") }}</span>
                                                <span v-else>{{ t("common.saving") }}</span>
                                            </Button>
                                        </div>
                                    </div>

                                    <div>
                                        <label class="mb-2 block text-sm font-medium">{{
                                            t("settings.family.currency")
                                        }}</label>
                                        <div class="flex gap-3">
                                            <Select v-model="editFamilyCurrency" :disabled="!userStore.isFamilyAdmin">
                                                <SelectTrigger
                                                    :aria-label="t('settings.family.aria.currency')"
                                                    class="flex-1">
                                                    <SelectValue :placeholder="t('settings.family.selectCurrency')" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <template v-for="code in currencyOptions" :key="code">
                                                            <SelectItem :value="code">{{ code }}</SelectItem>
                                                        </template>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                :disabled="savingFamilyCurrency || !canSaveFamilyCurrency"
                                                :aria-label="t('settings.family.aria.saveFamilyCurrency')"
                                                size="sm"
                                                variant="default"
                                                @click="saveFamilyCurrencyOnly">
                                                <span v-if="!savingFamilyCurrency">{{ t("common.save") }}</span>
                                                <span v-else>{{ t("common.saving") }}</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <p v-if="!userStore.isFamilyAdmin" class="text-muted-foreground mb-6 text-sm">
                                    {{ t("settings.family.adminOnly") }}
                                </p>

                                <hr class="border-border my-4" />

                                <h4 class="font-medium">{{ t("settings.family.members") }}</h4>
                                <ul class="mb-4">
                                    <li
                                        v-for="member in family.members || []"
                                        :key="member.id"
                                        class="flex items-center justify-between py-2">
                                        <div>
                                            <div class="text-sm font-medium">
                                                {{ member.username }}
                                            </div>
                                            <div class="text-muted-foreground text-xs">
                                                {{ member.email }}
                                            </div>
                                        </div>
                                        <div class="flex gap-2">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        v-if="
                                                            userStore.isFamilyAdmin && member.id !== userStore.user?.id
                                                        "
                                                        :disabled="removingMemberId === member.id || familyActionLoading"
                                                        :aria-label="t('settings.family.aria.removeMember')"
                                                        size="sm"
                                                        variant="destructive">
                                                        <span v-if="removingMemberId !== member.id">
                                                            {{ t("settings.family.remove") }}
                                                        </span>
                                                        <span v-else>{{ t("settings.family.removing") }}</span>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{{
                                                            t("settings.family.removeMember")
                                                        }}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {{ t("settings.family.removeMemberDescription") }}
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                                        <AlertDialogAction @click="() => removeMember(member.id)">{{
                                                            t("settings.family.remove")
                                                        }}</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </li>
                                </ul>

                                <hr v-if="userStore.isFamilyAdmin" class="border-border my-4" />

                                <h4 v-if="userStore.isFamilyAdmin" class="mb-2 font-medium">
                                    {{ t("settings.family.invites") }}
                                </h4>
                                <div v-if="userStore.isFamilyAdmin" class="mb-3 flex gap-2">
                                    <Input
                                        v-model="inviteEmail"
                                        :aria-label="t('settings.family.aria.inviteEmail')"
                                        :placeholder="t('settings.family.invitePlaceholder')" />
                                    <Button
                                        :disabled="!inviteEmail || inviting"
                                        :aria-label="t('settings.family.aria.inviteMember')"
                                        @click="handleInvite">
                                        <span v-if="!inviting">{{ t("settings.family.invite") }}</span>
                                        <span v-else>{{ t("settings.family.inviting") }}</span>
                                    </Button>
                                </div>

                                <ul>
                                    <li
                                        v-for="inv in invites"
                                        :key="inv.code"
                                        class="flex items-center justify-between py-2">
                                        <div>
                                            <div class="text-sm">
                                                {{ inv.email }}
                                            </div>
                                            <div class="text-muted-foreground text-xs">
                                                {{ t("settings.family.code") }}: {{ inv.code }}
                                            </div>
                                        </div>
                                        <div class="flex gap-2">
                                            <Button
                                                :aria-label="t('settings.family.aria.copyInviteCode')"
                                                size="sm"
                                                @click="copyInviteCode(inv.code)"
                                                >{{ t("common.copy") }}</Button
                                            >
                                            <Button
                                                :aria-label="t('settings.family.aria.revokeInvite')"
                                                size="sm"
                                                variant="destructive"
                                                @click="handleRevoke(inv.code)"
                                                >{{ t("settings.family.revoke") }}</Button
                                            >
                                        </div>
                                    </li>
                                </ul>
                            </section>

                            <section v-else class="text-muted-foreground text-sm">
                                <div>{{ t("settings.family.notMember") }}</div>
                            </section>
                        </div>
                    </Card>
                </main>
            </div>
        </div>
    </div>
</template>
