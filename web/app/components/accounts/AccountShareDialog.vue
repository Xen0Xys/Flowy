<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useAccountStore, type AccountShare, type AccountSharePermission} from "~/stores/account.store";
import {useFamilyStore} from "~/stores/family.store";
import {useUserStore} from "~/stores/user.store";
import type {User} from "~/stores/user.store";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Label} from "~/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Badge} from "~/components/ui/badge";

const props = defineProps<{
    open: boolean;
    accountId: string;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
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

const familyMembers = computed<User[]>(() => {
    const family = familyStore.family;
    if (!family) return [];
    const members = [family.owner, ...(family.members ?? [])];
    return members.filter((m) => m.id !== userStore.user?.id);
});

const alreadySharedIds = computed(() => new Set(shares.value.map((s) => s.sharedWithId)));

const shareableMembers = computed(() => familyMembers.value.filter((m) => !alreadySharedIds.value.has(m.id)));

const loadShares = async () => {
    isLoading.value = true;
    try {
        await familyStore.fetchFamily();
        shares.value = await accountStore.fetchShares(props.accountId);
    } finally {
        isLoading.value = false;
    }
};

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            selectedMemberId.value = "";
            selectedPermission.value = "READ";
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
        selectedMemberId.value = "";
        selectedPermission.value = "READ";
    } finally {
        isSubmitting.value = false;
    }
};

const updatePermission = async (share: AccountShare, next: AccountSharePermission) => {
    if (share.permission === next) return;
    const updated = await accountStore.updateShare(share.accountId, share.sharedWithId, next);
    shares.value = shares.value.map((s) => (s.id === updated.id ? updated : s));
};

const revoke = async (share: AccountShare) => {
    await accountStore.revokeShare(share.accountId, share.sharedWithId);
    shares.value = shares.value.filter((s) => s.id !== share.id);
};

const close = () => emit("update:open", false);
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{{ t("account.share.title") }}</DialogTitle>
                <DialogDescription>{{ t("account.share.description") }}</DialogDescription>
            </DialogHeader>

            <div class="flex flex-col gap-4 py-2">
                <section class="flex flex-col gap-2">
                    <Label>{{ t("account.share.currentShares") }}</Label>
                    <div v-if="isLoading" class="text-muted-foreground text-sm">{{ t("common.loading") }}</div>
                    <div v-else-if="shares.length === 0" class="text-muted-foreground text-sm">
                        {{ t("account.share.noShares") }}
                    </div>
                    <ul v-else class="flex flex-col gap-2">
                        <li
                            v-for="share in shares"
                            :key="share.id"
                            class="bg-muted/40 flex items-center justify-between rounded-lg border p-3">
                            <div class="min-w-0">
                                <div class="truncate text-sm font-medium">{{ share.sharedWithUsername }}</div>
                                <div class="text-muted-foreground truncate text-xs">{{ share.sharedWithEmail }}</div>
                            </div>
                            <div class="flex items-center gap-2">
                                <Select
                                    :model-value="share.permission"
                                    @update:model-value="
                                        (v: string) => updatePermission(share, v as AccountSharePermission)
                                    ">
                                    <SelectTrigger class="h-8 w-28">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="READ">{{ t("account.share.permission.read") }}</SelectItem>
                                        <SelectItem value="WRITE">{{ t("account.share.permission.write") }}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="icon" variant="ghost" @click="revoke(share)">
                                    <Icon class="h-4 w-4" name="iconoir:trash" />
                                    <span class="sr-only">{{ t("common.delete") }}</span>
                                </Button>
                            </div>
                        </li>
                    </ul>
                </section>

                <section v-if="shareableMembers.length > 0" class="flex flex-col gap-2 border-t pt-4">
                    <Label>{{ t("account.share.addShare") }}</Label>
                    <div class="flex flex-col gap-2 sm:flex-row">
                        <Select v-model="selectedMemberId">
                            <SelectTrigger class="flex-1">
                                <SelectValue :placeholder="t('account.share.selectMember')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="member in shareableMembers" :key="member.id" :value="member.id">
                                    {{ member.username }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Select v-model="selectedPermission">
                            <SelectTrigger class="w-full sm:w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="READ">{{ t("account.share.permission.read") }}</SelectItem>
                                <SelectItem value="WRITE">{{ t("account.share.permission.write") }}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button :disabled="!selectedMemberId || isSubmitting" @click="submitShare">
                            {{ t("account.share.add") }}
                        </Button>
                    </div>
                </section>
                <section
                    v-else-if="!isLoading && familyMembers.length === 0"
                    class="text-muted-foreground border-t pt-4 text-sm">
                    <Badge variant="outline">{{ t("account.share.noMembers") }}</Badge>
                </section>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="close">{{ t("common.close") }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
