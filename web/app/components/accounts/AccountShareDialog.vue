<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useAccountStore, type AccountShare, type AccountSharePermission} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {useUserStore} from "~/stores/user.store";
import type {User} from "~/stores/user.store";
import {Avatar, AvatarFallback} from "~/components/ui/avatar";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "~/components/ui/alert-dialog";
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
} from "~/components/ui/combobox";
import {InputGroup} from "~/components/ui/input-group";
import {cn} from "~/lib/utils";

const props = defineProps<{
    open: boolean;
    accountId: string;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "shares-changed", count: number): void;
}>();

const {t} = useI18n();
const accountStore = useAccountStore();
const familyStore = useFamilyStore();
const userStore = useUserStore();

const shares = ref<AccountShare[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const selectedMemberId = ref<string>("");
const selectedPermission = ref<AccountSharePermission>("READ");
const shareToRevoke = ref<AccountShare | null>(null);

const familyMembers = computed<User[]>(() => {
    const family = familyStore.family;
    if (!family) return [];
    const members = [family.owner, ...(family.members ?? [])];
    return members.filter((m) => m.id !== userStore.user?.id);
});

const alreadySharedIds = computed(() => new Set(shares.value.map((s) => s.sharedWithId)));

const shareableMembers = computed(() => familyMembers.value.filter((m) => !alreadySharedIds.value.has(m.id)));

const selectedMember = computed<User | null>(
    () => shareableMembers.value.find((m) => m.id === selectedMemberId.value) ?? null,
);

const memberCountLabel = computed(() => {
    const count = shares.value.length;
    if (count === 0) return t("account.share.membersCountZero");
    if (count === 1) return t("account.share.membersCountOne");
    return t("account.share.membersCountMany", {count});
});

const getInitials = (user: {username?: string; email?: string} | null | undefined) => {
    const source = user?.username || user?.email || "?";
    const trimmed = source.trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const raw =
        parts.length >= 2 ? `${(parts[0] || [""])[0] ?? ""}${(parts[1] || [""])[0] ?? ""}` : `${trimmed[0] ?? "?"}`;
    return raw.toUpperCase();
};

const loadShares = async () => {
    isLoading.value = true;
    try {
        await familyStore.fetchFamily();
        shares.value = await accountStore.fetchShares(props.accountId);
        emit("shares-changed", shares.value.length);
    } finally {
        isLoading.value = false;
    }
};

const resetForm = () => {
    selectedMemberId.value = "";
    selectedPermission.value = "READ";
};

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            resetForm();
            loadShares();
        }
    },
);

const submitShare = async () => {
    if (!selectedMemberId.value) return;
    isSubmitting.value = true;
    try {
        const share = await accountStore.shareAccount(props.accountId, selectedMemberId.value, selectedPermission.value);
        shares.value = [...shares.value, share];
        emit("shares-changed", shares.value.length);
        resetForm();
    } finally {
        isSubmitting.value = false;
    }
};

const updatePermission = async (share: AccountShare, next: AccountSharePermission) => {
    if (share.permission === next) return;
    const updated = await accountStore.updateShare(share.accountId, share.sharedWithId, next);
    shares.value = shares.value.map((s) => (s.id === updated.id ? updated : s));
};

const requestRevoke = (share: AccountShare) => {
    shareToRevoke.value = share;
};

const confirmRevoke = async () => {
    if (!shareToRevoke.value) return;
    const share = shareToRevoke.value;
    await accountStore.revokeShare(share.accountId, share.sharedWithId);
    shares.value = shares.value.filter((s) => s.id !== share.id);
    emit("shares-changed", shares.value.length);
    shareToRevoke.value = null;
};

const cancelRevoke = () => {
    shareToRevoke.value = null;
};

const close = () => emit("update:open", false);
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Icon class="text-primary size-5" name="iconoir:community" />
                    {{ t("account.share.title") }}
                </DialogTitle>
                <DialogDescription>{{ t("account.share.description") }}</DialogDescription>
            </DialogHeader>

            <div class="flex flex-col gap-5 py-2">
                <!-- Members with access -->
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <p class="text-sm font-medium">{{ t("account.share.currentShares") }}</p>
                        <span class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.7rem] font-medium">
                            {{ memberCountLabel }}
                        </span>
                    </div>

                    <div v-if="isLoading" class="text-muted-foreground text-sm">{{ t("common.loading") }}</div>

                    <div
                        v-else-if="shares.length === 0"
                        class="border-border/60 bg-muted/30 flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                        <div class="bg-muted flex size-10 items-center justify-center rounded-full">
                            <Icon class="text-muted-foreground size-5" name="iconoir:community" />
                        </div>
                        <p class="text-sm font-medium">{{ t("account.share.empty.title") }}</p>
                        <p class="text-muted-foreground max-w-xs text-xs">
                            {{ t("account.share.empty.description") }}
                        </p>
                    </div>

                    <ul v-else class="flex flex-col gap-2">
                        <li
                            v-for="share in shares"
                            :key="share.id"
                            class="group border-border/60 hover:border-border flex items-center gap-3 rounded-xl border p-3 transition-colors">
                            <Avatar size="sm">
                                <AvatarFallback class="bg-primary/15 text-primary text-xs font-semibold">
                                    {{
                                        getInitials({
                                            username: share.sharedWithUsername,
                                            email: share.sharedWithEmail,
                                        })
                                    }}
                                </AvatarFallback>
                            </Avatar>

                            <div class="min-w-0 flex-1">
                                <div class="truncate text-sm font-medium">{{ share.sharedWithUsername }}</div>
                                <div class="text-muted-foreground truncate text-xs">
                                    {{ share.sharedWithEmail }}
                                </div>
                            </div>

                            <!-- Segmented permission control -->
                            <div class="bg-muted flex shrink-0 items-center rounded-lg p-0.5">
                                <button
                                    type="button"
                                    :class="
                                        cn(
                                            'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                            share.permission === 'READ'
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )
                                    "
                                    :aria-pressed="share.permission === 'READ'"
                                    @click="updatePermission(share, 'READ')">
                                    <Icon class="size-3" name="iconoir:eye" />
                                    <span class="hidden sm:inline">{{ t("account.share.permission.read") }}</span>
                                </button>
                                <button
                                    type="button"
                                    :class="
                                        cn(
                                            'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                            share.permission === 'WRITE'
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )
                                    "
                                    :aria-pressed="share.permission === 'WRITE'"
                                    @click="updatePermission(share, 'WRITE')">
                                    <Icon class="size-3" name="iconoir:edit-pencil" />
                                    <span class="hidden sm:inline">{{ t("account.share.permission.write") }}</span>
                                </button>
                            </div>

                            <Button
                                size="icon"
                                variant="ghost"
                                class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-8 shrink-0"
                                :aria-label="t('account.share.revoke.action')"
                                @click="requestRevoke(share)">
                                <Icon class="size-4" name="iconoir:trash" />
                            </Button>
                        </li>
                    </ul>
                </section>

                <!-- Invite section -->
                <section v-if="!isLoading" class="border-border/60 flex flex-col gap-3 border-t pt-4">
                    <p class="text-sm font-medium">{{ t("account.share.invite.title") }}</p>

                    <template v-if="familyMembers.length === 0">
                        <p class="text-muted-foreground text-sm">{{ t("account.share.noMembers") }}</p>
                    </template>

                    <template v-else-if="shareableMembers.length === 0">
                        <p class="text-muted-foreground text-sm">{{ t("account.share.invite.noAvailable") }}</p>
                    </template>

                    <template v-else>
                        <div class="flex flex-col gap-2 sm:flex-row">
                            <!-- Member combobox -->
                            <Combobox v-model="selectedMemberId" :reset-search-term-on-select="true" class="flex-1">
                                <ComboboxAnchor as-child>
                                    <ComboboxTrigger as-child>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            class="w-full justify-between font-normal">
                                            <span v-if="selectedMember" class="flex items-center gap-2 truncate">
                                                <Avatar size="sm" class="size-5">
                                                    <AvatarFallback
                                                        class="bg-primary/15 text-primary text-[0.6rem] font-semibold">
                                                        {{ getInitials(selectedMember) }}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span class="truncate">{{ selectedMember.username }}</span>
                                            </span>
                                            <span v-else class="text-muted-foreground">
                                                {{ t("account.share.selectMember") }}
                                            </span>
                                            <Icon
                                                class="text-muted-foreground ml-2 size-4 shrink-0"
                                                name="iconoir:nav-arrow-down" />
                                        </Button>
                                    </ComboboxTrigger>
                                </ComboboxAnchor>
                                <ComboboxList
                                    class="*:data-[slot=input-group]:!m-0 *:data-[slot=input-group]:!rounded-none *:data-[slot=input-group]:!border-x-0 *:data-[slot=input-group]:!border-t-0">
                                    <InputGroup>
                                        <ComboboxInput
                                            class="text-base !outline-none focus:!ring-0 focus:!outline-none focus-visible:!ring-0 focus-visible:!outline-none md:text-sm"
                                            :placeholder="t('account.share.searchMembers')" />
                                    </InputGroup>
                                    <ComboboxEmpty>{{ t("common.noResults") }}</ComboboxEmpty>
                                    <ComboboxViewport>
                                        <ComboboxGroup>
                                            <ComboboxItem
                                                v-for="member in shareableMembers"
                                                :key="member.id"
                                                :value="member.id">
                                                <Avatar size="sm" class="size-6">
                                                    <AvatarFallback
                                                        class="bg-primary/15 text-primary text-[0.65rem] font-semibold">
                                                        {{ getInitials(member) }}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div class="flex min-w-0 flex-col">
                                                    <span class="truncate text-sm">{{ member.username }}</span>
                                                    <span class="text-muted-foreground truncate text-xs">
                                                        {{ member.email }}
                                                    </span>
                                                </div>
                                            </ComboboxItem>
                                        </ComboboxGroup>
                                    </ComboboxViewport>
                                </ComboboxList>
                            </Combobox>

                            <!-- Permission segmented control -->
                            <div class="bg-muted flex shrink-0 items-center rounded-lg p-0.5">
                                <button
                                    type="button"
                                    :class="
                                        cn(
                                            'flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none',
                                            selectedPermission === 'READ'
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )
                                    "
                                    :aria-pressed="selectedPermission === 'READ'"
                                    @click="selectedPermission = 'READ'">
                                    <Icon class="size-3" name="iconoir:eye" />
                                    {{ t("account.share.permission.read") }}
                                </button>
                                <button
                                    type="button"
                                    :class="
                                        cn(
                                            'flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none',
                                            selectedPermission === 'WRITE'
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )
                                    "
                                    :aria-pressed="selectedPermission === 'WRITE'"
                                    @click="selectedPermission = 'WRITE'">
                                    <Icon class="size-3" name="iconoir:edit-pencil" />
                                    {{ t("account.share.permission.write") }}
                                </button>
                            </div>

                            <Button :disabled="!selectedMember || isSubmitting" @click="submitShare">
                                <Icon class="size-4" name="iconoir:plus" />
                                {{ t("account.share.add") }}
                            </Button>
                        </div>
                    </template>
                </section>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="close">{{ t("common.close") }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Confirmation dialog for revoke -->
    <AlertDialog :open="!!shareToRevoke" @update:open="(v) => !v && cancelRevoke()">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{{ t("account.share.revoke.title") }}</AlertDialogTitle>
                <AlertDialogDescription>
                    {{
                        t("account.share.revoke.description", {
                            name: shareToRevoke?.sharedWithUsername ?? "",
                        })
                    }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel @click="cancelRevoke">{{ t("common.cancel") }}</AlertDialogCancel>
                <AlertDialogAction class="bg-destructive hover:bg-destructive/90 text-white" @click="confirmRevoke">
                    {{ t("account.share.revoke.confirm") }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
