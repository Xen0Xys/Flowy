<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useUserStore} from "~/stores/user.store";
import {useFamilyStore} from "~/stores/family.store";
import {toast} from "vue-sonner";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    ComboboxViewport,
} from "@/components/ui/combobox";
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
import {ChevronsUpDown} from "lucide-vue-next";

const userStore = useUserStore();
const familyStore = useFamilyStore();
const {t} = useI18n();
const {copy} = useClipboard();

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
const savingSettings = ref(false);

const removingMemberId = ref<string | null>(null);
const familyActionLoading = ref(false);
const currencyOptions = Object.keys(CURRENCY_LOCALES_MAP);

function computeInitials(name: string | undefined | null): string {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function memberRoleLabel(member: any): string {
    if (family.value?.owner?.id === member.id) return t("settings.family.owner");
    if (member.familyRole === "ADMIN") return t("settings.family.admin");
    return t("settings.family.member");
}

function memberRoleVariant(member: any): "default" | "secondary" | "outline" {
    if (family.value?.owner?.id === member.id) return "default";
    if (member.familyRole === "ADMIN") return "secondary";
    return "outline";
}

const familyRoleLabel = computed(() => {
    if (!family.value || !userStore.user?.id) return t("settings.family.member");
    if (family.value.owner?.id === userStore.user.id) return t("settings.family.owner");
    return userStore.isFamilyAdmin ? t("settings.family.admin") : t("settings.family.member");
});

const familyRoleVariant = computed<"default" | "secondary" | "outline">(() => {
    if (!family.value || !userStore.user?.id) return "outline";
    if (family.value.owner?.id === userStore.user.id) return "default";
    return userStore.isFamilyAdmin ? "secondary" : "outline";
});

const settingsDirty = computed(() => {
    if (!family.value) return false;
    const nameChanged = editFamilyName.value.trim() !== family.value.name;
    const currencyChanged =
        normalizeCurrencyCode(editFamilyCurrency.value) !== normalizeCurrencyCode(family.value.currency);
    return nameChanged || currencyChanged;
});

const canSaveSettings = computed(() => userStore.isFamilyAdmin && settingsDirty.value);

const allMembers = computed(() => {
    if (!family.value) return [];
    const owner = family.value.owner ? [family.value.owner] : [];
    const members = family.value.members ?? [];
    return [...owner, ...members];
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
        // store toasts
    }
}

async function copyInviteCode(code: string) {
    try {
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
    } finally {
        familyActionLoading.value = false;
    }
}

function resetSettings() {
    if (!family.value) return;
    editFamilyName.value = family.value.name;
    editFamilyCurrency.value = family.value.currency;
}

async function saveSettings() {
    if (!userStore.token || !userStore.isFamilyAdmin || !family.value) return;

    const name = editFamilyName.value.trim();
    const currency = normalizeCurrencyCode(editFamilyCurrency.value);

    const nameChanged = name !== family.value.name;
    const currencyChanged = currency !== normalizeCurrencyCode(family.value.currency);

    if (nameChanged) {
        if (!name) {
            toast.error(t("settings.family.errors.nameRequired"));
            return;
        }
        if (!isValidFamilyName(name)) {
            toast.error(t("settings.family.errors.nameLength"));
            return;
        }
    }
    if (currencyChanged && !isValidCurrencyCode(currency)) {
        toast.error(t("settings.family.errors.currencyInvalid"));
        return;
    }

    savingSettings.value = true;
    try {
        const payload: {name?: string; currency?: string} = {};
        if (nameChanged) payload.name = name;
        if (currencyChanged) payload.currency = currency;
        await familyStore.updateFamilySettings(payload);
        await loadFamily();
    } finally {
        savingSettings.value = false;
    }
}

async function removeMember(id: string) {
    if (!userStore.token || !userStore.isFamilyAdmin) return;
    try {
        removingMemberId.value = id;
        await familyStore.removeFamilyMember(id);
        family.value = await familyStore.fetchFamily();
        invites.value = await familyStore.getInvites();
    } finally {
        removingMemberId.value = null;
    }
}

onMounted(async () => {
    await loadFamily();
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
                        <Icon class="text-primary size-6" name="iconoir:community" />
                    </div>
                </div>
                <div>
                    <h1 class="font-heading text-2xl font-semibold tracking-tight">
                        {{ t("settings.family.title") }}
                    </h1>
                    <p class="text-muted-foreground text-sm">{{ t("settings.family.subtitle") }}</p>
                </div>
            </div>

            <div v-if="!familyLoaded || loading" class="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <Card class="lg:col-span-1">
                    <CardContent class="space-y-4">
                        <Skeleton class="mx-auto h-24 w-24 rounded-full" />
                        <Skeleton class="mx-auto h-5 w-40" />
                        <Skeleton class="mx-auto h-4 w-24" />
                    </CardContent>
                </Card>
                <div class="space-y-6 lg:col-span-2">
                    <Card>
                        <CardContent class="space-y-4">
                            <Skeleton class="h-6 w-40" />
                            <Skeleton class="h-10 w-full" />
                            <Skeleton class="h-10 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div v-else-if="family" class="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <aside class="lg:col-span-1">
                    <Card>
                        <CardContent class="flex flex-col items-center gap-4 text-center">
                            <div
                                class="bg-brand-gradient-soft border-border/60 flex size-20 items-center justify-center rounded-full border">
                                <Icon class="text-primary size-10" name="iconoir:community" />
                            </div>
                            <div class="min-w-0">
                                <div class="truncate text-lg font-medium">{{ family.name }}</div>
                                <div class="text-muted-foreground text-sm">
                                    {{ t("settings.family.memberCount", (family.members?.length ?? 0) + 1) }}
                                </div>
                            </div>
                            <Badge :variant="familyRoleVariant">{{ familyRoleLabel }}</Badge>

                            <template v-if="family.owner">
                                <Separator />
                                <div class="w-full text-left">
                                    <p class="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
                                        {{ t("settings.family.owner") }}
                                    </p>
                                    <div class="flex items-center gap-3">
                                        <Avatar class="size-9">
                                            <AvatarFallback class="text-xs font-semibold">
                                                {{ computeInitials(family.owner.username) }}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div class="min-w-0 flex-1">
                                            <p class="truncate text-sm font-medium">{{ family.owner.username }}</p>
                                            <p class="text-muted-foreground truncate text-xs">
                                                {{ family.owner.email }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </CardContent>
                    </Card>
                </aside>

                <main class="lg:col-span-2 lg:min-h-0">
                    <ScrollArea class="lg:h-full">
                        <div class="space-y-6 lg:pr-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{{ t("settings.family.sections.settings") }}</CardTitle>
                                    <CardDescription>{{
                                        t("settings.family.sections.settingsDescription")
                                    }}</CardDescription>
                                </CardHeader>
                                <CardContent class="space-y-4">
                                    <div class="space-y-2">
                                        <Label for="family-name">{{ t("settings.family.familyName") }}</Label>
                                        <Input
                                            id="family-name"
                                            v-model="editFamilyName"
                                            :disabled="!userStore.isFamilyAdmin"
                                            :placeholder="t('settings.family.familyName')" />
                                    </div>

                                    <div class="space-y-2">
                                        <Label for="family-currency">{{ t("settings.family.currency") }}</Label>
                                        <Combobox v-model="editFamilyCurrency" :reset-search-term-on-select="true">
                                            <ComboboxAnchor as-child>
                                                <ComboboxTrigger as-child>
                                                    <Button
                                                        id="family-currency"
                                                        :disabled="!userStore.isFamilyAdmin"
                                                        class="w-full justify-between font-normal sm:max-w-xs"
                                                        type="button"
                                                        variant="outline">
                                                        <span class="truncate">
                                                            {{
                                                                editFamilyCurrency || t("settings.family.selectCurrency")
                                                            }}
                                                        </span>
                                                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </ComboboxTrigger>
                                            </ComboboxAnchor>
                                            <ComboboxList
                                                class="*:data-[slot=input-group]:!m-0 *:data-[slot=input-group]:!rounded-none *:data-[slot=input-group]:!border-x-0 *:data-[slot=input-group]:!border-t-0">
                                                <ComboboxInput
                                                    :placeholder="t('settings.family.selectCurrency')"
                                                    class="text-base !outline-none focus:!ring-0 focus:!outline-none focus-visible:!ring-0 focus-visible:!outline-none md:text-sm" />
                                                <ComboboxEmpty>{{
                                                    t("settings.references.noSearchResults")
                                                }}</ComboboxEmpty>
                                                <ComboboxViewport>
                                                    <ComboboxGroup>
                                                        <ComboboxItem
                                                            v-for="code in currencyOptions"
                                                            :key="code"
                                                            :value="code">
                                                            {{ code }}
                                                        </ComboboxItem>
                                                    </ComboboxGroup>
                                                </ComboboxViewport>
                                            </ComboboxList>
                                        </Combobox>
                                    </div>

                                    <p v-if="!userStore.isFamilyAdmin" class="text-muted-foreground text-sm">
                                        {{ t("settings.family.adminOnly") }}
                                    </p>

                                    <div v-if="userStore.isFamilyAdmin" class="flex items-center justify-end gap-2 pt-2">
                                        <Button
                                            v-if="settingsDirty"
                                            :disabled="savingSettings"
                                            size="sm"
                                            variant="ghost"
                                            @click="resetSettings">
                                            {{ t("profile.discardChanges") }}
                                        </Button>
                                        <Button
                                            :disabled="!canSaveSettings || savingSettings"
                                            size="sm"
                                            @click="saveSettings">
                                            <span v-if="!savingSettings">{{ t("settings.family.saveChanges") }}</span>
                                            <span v-else>{{ t("common.saving") }}</span>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div class="flex items-center justify-between gap-3">
                                        <div class="min-w-0">
                                            <CardTitle>{{ t("settings.family.sections.members") }}</CardTitle>
                                            <CardDescription>
                                                {{ t("settings.family.sections.membersDescription") }}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline">
                                            {{ t("settings.family.memberCount", allMembers.length) }}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <ul class="divide-border divide-y">
                                        <li
                                            v-for="member in allMembers"
                                            :key="member.id"
                                            class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                            <Avatar class="size-9 shrink-0">
                                                <AvatarFallback class="text-xs font-semibold">
                                                    {{ computeInitials(member.username) }}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div class="min-w-0 flex-1">
                                                <div class="flex items-center gap-2">
                                                    <p class="truncate text-sm font-medium">{{ member.username }}</p>
                                                    <Badge
                                                        v-if="member.id === userStore.user?.id"
                                                        class="text-xs"
                                                        variant="ghost">
                                                        {{ t("settings.family.you") }}
                                                    </Badge>
                                                </div>
                                                <p class="text-muted-foreground truncate text-xs">{{ member.email }}</p>
                                            </div>
                                            <Badge :variant="memberRoleVariant(member)">{{
                                                memberRoleLabel(member)
                                            }}</Badge>
                                            <AlertDialog
                                                v-if="
                                                    userStore.isFamilyAdmin &&
                                                    member.id !== userStore.user?.id &&
                                                    member.id !== family.owner?.id
                                                ">
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        :aria-label="t('settings.family.aria.removeMember')"
                                                        :disabled="removingMemberId === member.id || familyActionLoading"
                                                        size="icon"
                                                        variant="ghost">
                                                        <Icon class="text-destructive size-4" name="iconoir:trash" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>
                                                            {{ t("settings.family.removeMember") }}
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {{ t("settings.family.removeMemberDescription") }}
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                                                        <AlertDialogAction @click="() => removeMember(member.id)">
                                                            {{ t("settings.family.remove") }}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </li>
                                    </ul>
                                </CardContent>
                            </Card>

                            <Card v-if="userStore.isFamilyAdmin">
                                <CardHeader>
                                    <div class="flex items-center justify-between gap-3">
                                        <div class="min-w-0">
                                            <CardTitle>{{ t("settings.family.sections.invites") }}</CardTitle>
                                            <CardDescription>
                                                {{ t("settings.family.sections.invitesDescription") }}
                                            </CardDescription>
                                        </div>
                                        <Badge v-if="invites.length" variant="outline">
                                            {{ t("settings.family.pendingInvitesCount", invites.length) }}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent class="space-y-4">
                                    <div class="flex flex-col gap-2 sm:flex-row">
                                        <Input
                                            v-model="inviteEmail"
                                            :aria-label="t('settings.family.aria.inviteEmail')"
                                            :placeholder="t('settings.family.invitePlaceholder')"
                                            class="flex-1"
                                            type="email"
                                            @keyup.enter="handleInvite" />
                                        <Button
                                            :aria-label="t('settings.family.aria.inviteMember')"
                                            :disabled="!inviteEmail || inviting"
                                            @click="handleInvite">
                                            <Icon class="size-4" name="iconoir:plus" />
                                            <span v-if="!inviting">{{ t("settings.family.invite") }}</span>
                                            <span v-else>{{ t("settings.family.inviting") }}</span>
                                        </Button>
                                    </div>

                                    <ul v-if="invites.length" class="divide-border divide-y">
                                        <li
                                            v-for="inv in invites"
                                            :key="inv.code"
                                            class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                            <div
                                                class="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
                                                <Icon class="text-muted-foreground size-4" name="iconoir:mail" />
                                            </div>
                                            <div class="min-w-0 flex-1">
                                                <p class="truncate text-sm">{{ inv.email }}</p>
                                                <div class="mt-0.5 flex items-center gap-2">
                                                    <code class="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                                                        {{ inv.code }}
                                                    </code>
                                                </div>
                                            </div>
                                            <Badge variant="secondary">{{ t("settings.family.invitedBadge") }}</Badge>
                                            <Button
                                                :aria-label="t('settings.family.aria.copyInviteCode')"
                                                size="icon"
                                                variant="ghost"
                                                @click="copyInviteCode(inv.code)">
                                                <Icon class="size-4" name="iconoir:copy" />
                                            </Button>
                                            <Button
                                                :aria-label="t('settings.family.aria.revokeInvite')"
                                                size="icon"
                                                variant="ghost"
                                                @click="handleRevoke(inv.code)">
                                                <Icon class="text-destructive size-4" name="iconoir:xmark" />
                                            </Button>
                                        </li>
                                    </ul>

                                    <div
                                        v-else
                                        class="border-border/60 text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm">
                                        {{ t("settings.family.noInvites") }}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card class="border-destructive/40">
                                <CardHeader>
                                    <CardTitle class="text-destructive flex items-center gap-2">
                                        <Icon class="size-5" name="iconoir:warning-triangle" />
                                        {{ t("profile.dangerZone") }}
                                    </CardTitle>
                                    <CardDescription>
                                        {{
                                            userStore.isFamilyAdmin
                                                ? t("settings.family.deleteFamilyDescription")
                                                : t("settings.family.leaveFamilyDescription")
                                        }}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                                        <div class="text-sm">
                                            <p class="font-medium">
                                                {{
                                                    userStore.isFamilyAdmin
                                                        ? t("settings.family.deleteFamily")
                                                        : t("settings.family.leaveFamily")
                                                }}
                                            </p>
                                            <p class="text-muted-foreground text-xs">
                                                {{
                                                    userStore.isFamilyAdmin
                                                        ? t("settings.family.deleteThis")
                                                        : t("settings.family.leaveThis")
                                                }}
                                            </p>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" variant="destructive">
                                                    {{
                                                        userStore.isFamilyAdmin
                                                            ? t("common.delete")
                                                            : t("settings.family.leave")
                                                    }}
                                                </Button>
                                            </AlertDialogTrigger>
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
                                                            userStore.isFamilyAdmin
                                                                ? handleDeleteFamily()
                                                                : handleLeaveFamily()
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
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                </main>
            </div>

            <Card v-else>
                <CardContent class="text-muted-foreground py-12 text-center text-sm">
                    {{ t("settings.family.notMember") }}
                </CardContent>
            </Card>
        </div>
    </div>
</template>
