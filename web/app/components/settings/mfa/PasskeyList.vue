<script lang="ts" setup>
import {onMounted, ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import PasswordConfirmDialog from "@/components/common/PasswordConfirmDialog.vue";
import PasskeyRegisterDialog from "./PasskeyRegisterDialog.vue";
import {useMfa, type PasskeyResponse} from "@/composables/useMfa";

const emit = defineEmits<{
    (e: "changed"): void;
}>();

const {t, d} = useI18n();
const {listPasskeys, renamePasskey, deletePasskey} = useMfa();

const passkeys = ref<PasskeyResponse[]>([]);
const loadingList = ref(false);
const editingId = ref<string | null>(null);
const draftLabel = ref("");
const savingRename = ref(false);
const isRegisterOpen = ref(false);
const deleteTargetId = ref<string | null>(null);
const deletingId = ref<string | null>(null);

async function refresh() {
    loadingList.value = true;
    try {
        passkeys.value = await listPasskeys();
    } catch {
        // toast handled in composable
    } finally {
        loadingList.value = false;
    }
}

function startEdit(passkey: PasskeyResponse) {
    editingId.value = passkey.id;
    draftLabel.value = passkey.label;
}

function cancelEdit() {
    editingId.value = null;
    draftLabel.value = "";
}

async function confirmRename(passkey: PasskeyResponse) {
    const next = draftLabel.value.trim();
    if (!next || next === passkey.label) {
        cancelEdit();
        return;
    }
    savingRename.value = true;
    try {
        const updated = await renamePasskey(passkey.id, next);
        const idx = passkeys.value.findIndex((p) => p.id === passkey.id);
        if (idx >= 0) passkeys.value[idx] = updated;
        cancelEdit();
    } catch {
        // toast handled in composable
    } finally {
        savingRename.value = false;
    }
}

async function confirmDelete(currentPassword: string) {
    if (!deleteTargetId.value) return;
    deletingId.value = deleteTargetId.value;
    try {
        await deletePasskey(deleteTargetId.value, currentPassword);
        passkeys.value = passkeys.value.filter((p) => p.id !== deleteTargetId.value);
        deleteTargetId.value = null;
        emit("changed");
    } catch {
        // toast handled in composable
    } finally {
        deletingId.value = null;
    }
}

async function handleRegistered() {
    await refresh();
    emit("changed");
    toast.success(t("profile.mfa.passkeys.toasts.registered"));
}

function formatDate(iso: string | null): string {
    if (!iso) return t("profile.mfa.passkeys.list.never");
    return d(new Date(iso), "short");
}

onMounted(refresh);
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <div>
                <h3 class="text-sm font-medium">{{ t("profile.mfa.passkeys.title") }}</h3>
                <p class="text-muted-foreground text-xs">{{ t("profile.mfa.passkeys.description") }}</p>
            </div>
            <Button size="sm" type="button" @click="isRegisterOpen = true">
                <Icon class="mr-1 size-4" name="iconoir:plus" />
                {{ t("profile.mfa.passkeys.add") }}
            </Button>
        </div>

        <div v-if="loadingList && passkeys.length === 0" class="text-muted-foreground text-sm">
            {{ t("common.loading") }}
        </div>

        <div v-else-if="passkeys.length === 0" class="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
            {{ t("profile.mfa.passkeys.empty") }}
        </div>

        <ul v-else class="space-y-2">
            <li
                v-for="passkey in passkeys"
                :key="passkey.id"
                class="border-border/60 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0 flex-1">
                    <div v-if="editingId === passkey.id" class="flex items-center gap-2">
                        <Input
                            v-model="draftLabel"
                            :disabled="savingRename"
                            :placeholder="t('profile.mfa.passkeys.register.labelPlaceholder')"
                            class="max-w-xs"
                            maxlength="50"
                            @keydown.enter="confirmRename(passkey)"
                            @keydown.esc="cancelEdit" />
                        <Button
                            :disabled="savingRename || !draftLabel.trim()"
                            size="sm"
                            type="button"
                            @click="confirmRename(passkey)">
                            {{ t("common.save") }}
                        </Button>
                        <Button :disabled="savingRename" size="sm" type="button" variant="ghost" @click="cancelEdit">
                            {{ t("common.cancel") }}
                        </Button>
                    </div>
                    <div v-else class="min-w-0">
                        <div class="truncate text-sm font-medium">{{ passkey.label }}</div>
                        <div class="text-muted-foreground text-xs">
                            {{ t("profile.mfa.passkeys.list.createdOn", {date: formatDate(passkey.createdAt)}) }}
                            <span aria-hidden="true"> · </span>
                            {{ t("profile.mfa.passkeys.list.lastUsed", {date: formatDate(passkey.lastUsedAt)}) }}
                        </div>
                    </div>
                </div>
                <div v-if="editingId !== passkey.id" class="flex items-center gap-1">
                    <Button
                        :aria-label="t('profile.mfa.passkeys.list.rename')"
                        size="icon"
                        type="button"
                        variant="ghost"
                        @click="startEdit(passkey)">
                        <Icon class="size-4" name="iconoir:edit-pencil" />
                    </Button>
                    <Button
                        :aria-label="t('profile.mfa.passkeys.list.delete')"
                        :disabled="deletingId === passkey.id"
                        size="icon"
                        type="button"
                        variant="ghost"
                        @click="deleteTargetId = passkey.id">
                        <Icon class="text-destructive size-4" name="iconoir:trash" />
                    </Button>
                </div>
            </li>
        </ul>

        <PasskeyRegisterDialog
            :open="isRegisterOpen"
            @registered="handleRegistered"
            @update:open="isRegisterOpen = $event" />

        <PasswordConfirmDialog
            :confirm-label="t('profile.mfa.passkeys.list.delete')"
            :description="t('profile.mfa.passkeys.delete.description')"
            :loading="deletingId !== null"
            :open="deleteTargetId !== null"
            :title="t('profile.mfa.passkeys.delete.title')"
            input-id="passkey-delete-password"
            @confirm="confirmDelete"
            @update:open="
                (value) => {
                    if (!value) deleteTargetId = null;
                }
            " />
    </div>
</template>
