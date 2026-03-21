<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {useUserStore} from "~/stores/user.store";
import {useFamilyStore} from "~/stores/family.store";
import {toast} from "vue-sonner";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
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

const userStore = useUserStore();
const familyStore = useFamilyStore();

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
const creating = ref(false);
const inviting = ref(false);

const newFamilyName = ref("");
const newFamilyCurrency = ref("EUR");
const inviteEmail = ref("");

const hasFamily = computed(() => userStore.hasFamily);
const removingMemberId = ref<string | null>(null);
const familyActionLoading = ref(false);

async function loadFamily() {
    if (!userStore.token) return;
    familyLoaded.value = false;
    loading.value = true;
    try {
        family.value = await familyStore.fetchFamily();
        if (userStore.isFamilyAdmin) invites.value = await familyStore.getInvites();
    } catch (err) {
        // errors are handled in the store (toasts)
    } finally {
        loading.value = false;
        familyLoaded.value = true;
    }
}

async function handleCreateFamily() {
    if (!userStore.token) return;
    const name = newFamilyName.value.trim();
    const currency = normalizeCurrencyCode(newFamilyCurrency.value);

    if (!name) {
        toast.error("Family name is required.");
        return;
    }

    if (!isValidFamilyName(name)) {
        toast.error("Family name must be between 3 and 50 characters.");
        return;
    }

    if (!isValidCurrencyCode(currency)) {
        toast.error("Currency must be a valid 3-letter ISO code.");
        return;
    }

    creating.value = true;
    try {
        await familyStore.createFamily({
            name,
            currency,
        });
        newFamilyName.value = "";
        newFamilyCurrency.value = currency;
        // refresh profile and family
        await loadFamily();
    } finally {
        creating.value = false;
    }
}

async function handleInvite() {
    if (!userStore.token) return;
    const nextInviteEmail = inviteEmail.value.trim();
    if (!nextInviteEmail) {
        toast.error("Email is required.");
        return;
    }

    if (!isValidEmail(nextInviteEmail)) {
        toast.error("Please enter a valid email address.");
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
        toast.success("Invite code copied to clipboard");
    } catch (err) {
        toast.error("Failed to copy invite code");
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

onMounted(async () => {
    if (hasFamily.value) await loadFamily();
    else familyLoaded.value = true;
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
                <h1 class="text-2xl font-semibold">Family</h1>
                <p class="text-muted-foreground text-sm">Manage your family settings, members and invites</p>
            </div>

            <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                <aside class="md:col-span-1">
                    <Card class="h-full" innerClass="p-6">
                        <div class="flex flex-col gap-3">
                            <div class="text-muted-foreground text-sm">Status</div>
                            <div class="text-lg font-medium">
                                <span v-if="hasFamily">In a family</span>
                                <span v-else>Not in a family</span>
                            </div>
                            <div class="mt-2">
                                <template v-if="!hasFamily">
                                    <div class="text-muted-foreground mb-2 text-sm">
                                        Create a new family to start sharing budgets and members.
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <Input
                                            v-model="newFamilyName"
                                            aria-label="Family name"
                                            placeholder="Family name" />
                                        <Input
                                            v-model="newFamilyCurrency"
                                            aria-label="Currency"
                                            placeholder="Currency (e.g. EUR)" />
                                        <Button
                                            :disabled="creating || !userStore.token || !newFamilyName"
                                            aria-label="Create family"
                                            @click="handleCreateFamily">
                                            <span v-if="!creating">Create family</span>
                                            <span v-else>Creating...</span>
                                        </Button>
                                    </div>
                                </template>
                                <template v-else>
                                    <div class="text-muted-foreground text-sm">
                                        <div v-if="!familyLoaded || loading">
                                            <Skeleton class="mb-2 h-4 w-32" />
                                            <Skeleton class="h-3 w-28" />
                                        </div>
                                        <div v-else>
                                            <div>{{ family?.name }}</div>
                                            <div class="text-xs">Currency: {{ family?.currency }}</div>
                                            <div class="mt-3">
                                                <template v-if="userStore.isFamilyAdmin">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                :disabled="familyActionLoading"
                                                                aria-label="Delete family"
                                                                size="sm"
                                                                variant="destructive">
                                                                <span v-if="!familyActionLoading">Delete family</span>
                                                                <span v-else>Processing...</span>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete family</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This action will permanently delete the family,
                                                                    remove all invites and unlink members. This cannot be
                                                                    undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction @click="handleDeleteFamily"
                                                                    >Delete</AlertDialogAction
                                                                >
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </template>
                                                <template v-else>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                :disabled="familyActionLoading"
                                                                aria-label="Leave family"
                                                                size="sm"
                                                                variant="destructive">
                                                                <span v-if="!familyActionLoading">Leave family</span>
                                                                <span v-else>Processing...</span>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Leave family</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to leave the family? You will
                                                                    no longer have access to shared data.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                >
                                                                <AlertDialogAction @click="handleLeaveFamily"
                                                                    >Leave</AlertDialogAction
                                                                >
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </template>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                            </div>
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
                                <h3 class="mb-2 text-lg font-medium">Family info</h3>
                                <div class="text-muted-foreground mb-4 text-sm">
                                    Owner: {{ family.owner?.username }} ({{ family.owner?.email }})
                                </div>

                                <h4 class="font-medium">Members</h4>
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
                                                        aria-label="Remove member"
                                                        size="sm"
                                                        variant="destructive">
                                                        <span v-if="removingMemberId !== member.id">Remove</span>
                                                        <span v-else>Removing...</span>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Remove member</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to remove this member from the family?
                                                            They will lose access to shared data.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction @click="() => removeMember(member.id)"
                                                            >Remove</AlertDialogAction
                                                        >
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </li>
                                </ul>

                                <hr v-if="userStore.isFamilyAdmin" class="border-border my-4" />

                                <h4 v-if="userStore.isFamilyAdmin" class="mb-2 font-medium">Invites</h4>
                                <div v-if="userStore.isFamilyAdmin" class="mb-3 flex gap-2">
                                    <Input
                                        v-model="inviteEmail"
                                        aria-label="Invite email"
                                        placeholder="member@example.com" />
                                    <Button
                                        :disabled="!inviteEmail || inviting"
                                        aria-label="Invite member"
                                        @click="handleInvite">
                                        <span v-if="!inviting">Invite</span>
                                        <span v-else>Inviting...</span>
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
                                            <div class="text-muted-foreground text-xs">Code: {{ inv.code }}</div>
                                        </div>
                                        <div class="flex gap-2">
                                            <Button
                                                aria-label="Copy invite code"
                                                size="sm"
                                                @click="copyInviteCode(inv.code)"
                                                >Copy</Button
                                            >
                                            <Button
                                                aria-label="Revoke invite"
                                                size="sm"
                                                variant="destructive"
                                                @click="handleRevoke(inv.code)"
                                                >Revoke</Button
                                            >
                                        </div>
                                    </li>
                                </ul>
                            </section>

                            <section v-else class="text-muted-foreground text-sm">
                                <div>You are not a member of any family. Create one or ask to be invited.</div>
                            </section>
                        </div>
                    </Card>
                </main>
            </div>
        </div>
    </div>
</template>
