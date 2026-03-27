<script lang="ts" setup>
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useUserStore} from "~/stores/user.store";
import {computed, onMounted, ref, watchEffect} from "vue";
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
const colorMode = useColorMode();

const initials = computed(() => {
    const name = userStore.user?.username ?? username.value ?? "";
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
});
const avatarUrl = computed(() => userStore.user?.avatar || "");

const effectiveRole = ref("Member");

async function computeEffectiveRole() {
    if (await userStore.isInstanceOwner) effectiveRole.value = "Instance Owner";
    else if (userStore.isFamilyAdmin) effectiveRole.value = "Family Admin";
    else effectiveRole.value = "Family Member";
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
        toast.error("Current password is required to delete your account.");
        return;
    }
    deleting.value = true;
    try {
        await apiFetch("/user/me", {
            method: "DELETE",
            body: {currentPassword: confirmPassword.value.trim()},
        });
        toast.success("Account deleted");
        deleting.value = false;
        // always clear local session
        userStore.logout();
        await useRouter().push("/auth/login");
    } catch (err: any) {
        const message = err?.data?.message ?? err?.message ?? "Failed deleting account";
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

// instance ownership is fetched alongside profile (see token watcher)

async function saveUsernameOnly() {
    if (!userStore.token) return;
    const nextUsername = username.value.trim();
    if (!isValidUsername(nextUsername)) {
        toast.error(`Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`);
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
        toast.error("Please enter a valid email address.");
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
        toast.error("Current password and new password are required.");
        return;
    }

    if (!isValidPassword(next)) {
        toast.error(`New password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
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
                <h1 class="text-2xl font-semibold">Profile</h1>
                <p class="text-muted-foreground text-sm">Manage your personal information and credentials</p>
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
                            <label class="mb-2 block text-sm font-medium">Username</label>
                            <div class="flex gap-3">
                                <Input v-model="username" aria-label="Username" class="flex-1" placeholder="Username" />
                                <Button
                                    :disabled="savingUsername || !userStore.token"
                                    aria-label="Save username"
                                    size="sm"
                                    variant="default"
                                    @click="saveUsernameOnly">
                                    <span v-if="!savingUsername">Save</span>
                                    <span v-else>Saving...</span>
                                </Button>
                            </div>
                        </div>

                        <div class="mb-6">
                            <div class="flex gap-3">
                                <Input
                                    v-model="email"
                                    aria-label="Email"
                                    class="flex-1"
                                    placeholder="Email"
                                    type="email" />
                                <Button
                                    :disabled="savingEmail || !userStore.token"
                                    aria-label="Save email"
                                    size="sm"
                                    variant="default"
                                    @click="saveEmailOnly">
                                    <span v-if="!savingEmail">Save</span>
                                    <span v-else>Saving...</span>
                                </Button>
                            </div>
                        </div>

                        <hr class="border-border my-4" />

                        <div class="mb-6">
                            <label class="mb-2 block text-sm font-medium">Appearance</label>
                            <Select v-model="colorMode.preference">
                                <SelectTrigger class="w-[180px]">
                                    <SelectValue placeholder="Select a theme" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="system">System</SelectItem>
                                        <SelectItem value="light">Light</SelectItem>
                                        <SelectItem value="dark">Dark</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        <hr class="border-border my-4" />

                        <div>
                            <label class="mb-2 block text-sm font-medium">Change password</label>
                            <p class="text-muted-foreground mb-3 text-sm">
                                Enter your current password and choose a new password.
                            </p>
                            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Input
                                    v-model="currentPassword"
                                    aria-label="Current password"
                                    placeholder="Current password"
                                    type="password" />
                                <Input
                                    v-model="newPassword"
                                    aria-label="New password"
                                    placeholder="New password"
                                    type="password" />
                            </div>
                            <div class="mt-4 flex justify-end">
                                <Button
                                    :disabled="changingPassword || !userStore.token || !currentPassword || !newPassword"
                                    aria-label="Change password"
                                    size="sm"
                                    @click="changePasswordNow">
                                    <span v-if="!changingPassword">Change password</span>
                                    <span v-else>Updating...</span>
                                </Button>
                            </div>
                            <hr class="border-border my-4" />
                            <div class="mt-6">
                                <AlertDialog>
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-sm font-medium">Danger zone</p>
                                            <p class="text-muted-foreground text-xs">Permanently delete your account</p>
                                        </div>
                                        <AlertDialogTrigger>
                                            <Button size="sm" variant="destructive">Delete account</Button>
                                        </AlertDialogTrigger>
                                    </div>

                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete account</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action is irreversible. Please enter your current password to
                                                confirm.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div class="mt-4">
                                            <Input
                                                v-model="confirmPassword"
                                                aria-label="Confirm password"
                                                placeholder="Current password"
                                                type="password" />
                                        </div>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction :disabled="deleting" @click="deleteAccountNow">
                                                <span v-if="!deleting">Delete</span>
                                                <span v-else>Deleting...</span>
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
