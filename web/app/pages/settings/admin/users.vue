<script setup lang="ts">
import {ref, watch} from "vue";
import {useUserStore} from "~/stores/user.store";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
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
                            <th class="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="u in users" :key="u.id" class="border-t">
                            <td class="py-3">{{ u.username }}</td>
                            <td class="py-3">{{ u.email }}</td>
                            <td class="py-3 text-right">
                                <div
                                    class="flex items-center justify-end gap-2">
                                    <Input
                                        v-model="newPasswords[u.id]"
                                        placeholder="New password"
                                        class="w-48" />
                                    <Button
                                        :disabled="resettingId === u.id"
                                        size="sm"
                                        @click="triggerResetPassword(u.id)">
                                        <span v-if="resettingId !== u.id"
                                            >Reset</span
                                        >
                                        <span v-else>Resetting...</span>
                                    </Button>

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
