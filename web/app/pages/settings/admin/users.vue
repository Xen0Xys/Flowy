<script setup lang="ts">
import {ref, watch} from "vue";
import {toast} from "vue-sonner";
import {useClipboard} from "@vueuse/core";
import {useUserStore} from "~/stores/user.store";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";

const userStore = useUserStore();

const users = ref<any[]>([]);
const loading = ref(false);
const deletingId = ref<string | null>(null);
const resettingId = ref<string | null>(null);
const newPasswords = ref<Record<string, string>>({});
const instanceOwnerId = ref<string | null>(null);
const resetDialogId = ref<string | null>(null);

async function loadUsers() {
    if (!userStore.token) return;
    loading.value = true;
    try {
        users.value = await userStore.listAdminUsers();
        // fetch instance settings to know owner id and prevent deletion
        try {
            const settings = await userStore.getInstanceSettings();
            instanceOwnerId.value = settings?.instanceOwner ?? null;
        } catch (e) {
            // ignore if not instance owner
            instanceOwnerId.value = null;
        }
    } finally {
        loading.value = false;
    }
}

watch(
    () => userStore.token,
    (t) => {
        if (t) loadUsers();
    },
    {immediate: true},
);

async function triggerDelete(id: string) {
    deletingId.value = id;
    try {
        await userStore.adminDeleteUser(id);
        await loadUsers();
    } finally {
        deletingId.value = null;
    }
}

async function triggerResetPassword(id: string) {
    resettingId.value = id;
    try {
        const pass = newPasswords.value[id] ?? "";
        await userStore.adminUpdateUserPassword(id, pass || "changeme");
        // clear only that user's password field
        newPasswords.value = {...newPasswords.value, [id]: ""};
    } finally {
        resettingId.value = null;
    }
}

async function handleResetPassword(id: string) {
    try {
        await triggerResetPassword(id);
        resetDialogId.value = null;
    } catch {
        resetDialogId.value = null;
    }
}

async function copyUserId(id: string) {
    try {
        const {copy} = useClipboard();
        await copy(id);
        toast.success("UUID copied to clipboard");
    } catch {
        toast.error("Failed to copy UUID");
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto w-full max-w-6xl py-6">
            <div class="mb-6">
                <h1 class="text-2xl font-semibold">Users</h1>
                <p class="text-muted-foreground text-sm">
                    Manage users on this instance
                </p>
            </div>

            <Card>
                <div v-if="loading" class="text-muted-foreground text-sm">
                    Loading...
                </div>
                <table v-else class="w-full table-auto">
                    <thead>
                        <tr class="text-left">
                            <th>Username</th>
                            <th>Email</th>
                            <th>UUID</th>
                            <th class="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="u in users" :key="u.id" class="border-t">
                            <td class="py-3">{{ u.username }}</td>
                            <td class="py-3">{{ u.email }}</td>
                            <td class="py-3">
                                <div class="flex items-center gap-2">
                                    <span
                                        class="text-muted-foreground max-w-[220px] truncate font-mono text-xs"
                                        :title="u.id"
                                        >{{ u.id }}</span
                                    >
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        @click="copyUserId(u.id)"
                                        >Copy</Button
                                    >
                                </div>
                            </td>
                            <td class="py-3 text-right">
                                <div
                                    class="flex items-center justify-end gap-2">
                                    <Dialog
                                        :open="resetDialogId === u.id"
                                        @update:open="
                                            (value) =>
                                                (resetDialogId = value
                                                    ? u.id
                                                    : null)
                                        ">
                                        <DialogTrigger as-child>
                                            <Button size="sm"
                                                >Reset Password</Button
                                            >
                                        </DialogTrigger>
                                        <DialogContent class="max-w-md">
                                            <DialogHeader>
                                                <DialogTitle
                                                    >Reset Password</DialogTitle
                                                >
                                                <DialogDescription>
                                                    Set a new password for
                                                    {{ u.username }}.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div class="grid gap-2">
                                                <Input
                                                    v-model="newPasswords[u.id]"
                                                    placeholder="New password"
                                                    type="password" />
                                                <div
                                                    class="text-muted-foreground text-xs">
                                                    Leave empty to use the
                                                    default password.
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    variant="outline"
                                                    @click="
                                                        resetDialogId = null
                                                    "
                                                    >Cancel</Button
                                                >
                                                <Button
                                                    :disabled="
                                                        resettingId === u.id
                                                    "
                                                    @click="
                                                        handleResetPassword(
                                                            u.id,
                                                        )
                                                    ">
                                                    <span
                                                        v-if="
                                                            resettingId !== u.id
                                                        "
                                                        >Reset Password</span
                                                    >
                                                    <span v-else
                                                        >Resetting...</span
                                                    >
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                :disabled="
                                                    u.id === instanceOwnerId ||
                                                    deletingId === u.id
                                                "
                                                aria-disabled="u.id === instanceOwnerId"
                                                :title="
                                                    u.id === instanceOwnerId
                                                        ? 'Cannot delete instance owner'
                                                        : 'Delete user'
                                                "
                                                >Delete</Button
                                            >
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle
                                                    >Delete
                                                    user</AlertDialogTitle
                                                >
                                                <AlertDialogDescription
                                                    >Are you sure you want to
                                                    delete this
                                                    user?</AlertDialogDescription
                                                >
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel
                                                    >Cancel</AlertDialogCancel
                                                >
                                                <AlertDialogAction
                                                    @click="triggerDelete(u.id)"
                                                    :disabled="
                                                        u.id ===
                                                            instanceOwnerId ||
                                                        deletingId === u.id
                                                    "
                                                    >Delete</AlertDialogAction
                                                >
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    </div>
</template>
