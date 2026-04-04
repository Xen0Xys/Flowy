<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useClipboard} from "@vueuse/core";
import {
    type ColumnDef,
    FlexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    type SortingState,
    useVueTable,
} from "@tanstack/vue-table";
import {Copy, Eye, KeyRound, MoreHorizontal, Trash2} from "lucide-vue-next";
import {toast} from "vue-sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {valueUpdater} from "@/components/ui/table/utils";
import {isValidPassword, PASSWORD_MIN_LENGTH} from "@/lib/validation";

type AdminUser = {
    id: string;
    username: string;
    email: string;
    familyId: string | null;
    familyRole: string | null;
};

type DetailsState = {
    user: AdminUser;
    family: Family | null;
};

const userStore = useUserStore();
const familyStore = useFamilyStore();
const {copy, isSupported} = useClipboard({legacy: true});
const {t} = useI18n();

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const deletingId = ref<string | null>(null);
const resettingId = ref<string | null>(null);
const instanceOwnerId = ref<string | null>(null);

const globalFilter = ref("");
const sorting = ref<SortingState>([]);

const detailsState = ref<DetailsState | null>(null);
const loadingDetails = ref(false);
const resetDialogUser = ref<AdminUser | null>(null);
const deleteDialogUser = ref<AdminUser | null>(null);
const isDeleteDialogOpen = ref(false);
const resetPasswordValue = ref("");
const isResettingCurrentUser = computed(() =>
    Boolean(resetDialogUser.value && resettingId.value === resetDialogUser.value.id),
);

const columns = computed<ColumnDef<AdminUser>[]>(() => [
    {
        accessorKey: "username",
        header: t("auth.common.username"),
    },
    {
        accessorKey: "email",
        header: t("auth.common.email"),
    },
    {
        accessorKey: "id",
        header: t("settings.users.uuid"),
    },
    {
        id: "actions",
        header: "",
        enableSorting: false,
    },
]);

const table = useVueTable({
    get data() {
        return users.value;
    },
    get columns() {
        return columns.value;
    },
    state: {
        get globalFilter() {
            return globalFilter.value;
        },
        get sorting() {
            return sorting.value;
        },
    },
    onGlobalFilterChange: (updater) => valueUpdater(updater, globalFilter),
    onSortingChange: (updater) => valueUpdater(updater, sorting),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
        const query = String(filterValue ?? "")
            .trim()
            .toLowerCase();
        if (!query) return true;
        return [row.original.username, row.original.email, row.original.id]
            .map((value) => value.toLowerCase())
            .some((value) => value.includes(query));
    },
});

async function loadUsers() {
    if (!userStore.token) return;
    loading.value = true;
    try {
        users.value = (await userStore.listAdminUsers()) as AdminUser[];
        try {
            const settings = await userStore.getInstanceSettings();
            instanceOwnerId.value = settings?.instanceOwner ?? null;
        } catch {
            instanceOwnerId.value = null;
        }
    } finally {
        loading.value = false;
    }
}

watch(
    () => userStore.token,
    (token) => {
        if (token) loadUsers();
    },
    {immediate: true},
);

function openResetDialog(user: AdminUser) {
    resetPasswordValue.value = "";
    resetDialogUser.value = user;
}

function openDeleteDialog(user: AdminUser) {
    deleteDialogUser.value = user;
}

function findFamilyMemberRole(family: Family, userId: string) {
    if (family.owner?.id === userId) return family.owner.familyRole ?? "ADMIN";
    const member = family.members?.find((entry: User) => entry.id === userId);
    return member?.familyRole ?? null;
}

function formatFamilyRole(role: string | null | undefined) {
    if (!role) return "-";

    if (role === "ADMIN") return t("settings.family.admin");
    if (role === "USER") return t("settings.family.member");

    return role;
}

function getDetailsFamilyRoleLabel(details: DetailsState) {
    const role = details.family ? findFamilyMemberRole(details.family, details.user.id) : details.user.familyRole;

    return formatFamilyRole(role);
}

async function openDetailsDialog(user: AdminUser) {
    detailsState.value = {
        user,
        family: null,
    };

    if (!user.familyId) return;

    loadingDetails.value = true;
    try {
        const family = await familyStore.adminGetFamily(user.familyId);
        if (!detailsState.value || detailsState.value.user.id !== user.id) return;
        detailsState.value = {
            user,
            family,
        };
    } catch {
        if (!detailsState.value || detailsState.value.user.id !== user.id) return;
        detailsState.value = {
            user,
            family: null,
        };
    } finally {
        loadingDetails.value = false;
    }
}

async function handleDelete() {
    const user = deleteDialogUser.value;
    if (!user) return;
    deletingId.value = user.id;
    try {
        await userStore.adminDeleteUser(user.id);
        deleteDialogUser.value = null;
        await loadUsers();
    } finally {
        deletingId.value = null;
    }
}

async function handleResetPassword() {
    const user = resetDialogUser.value;
    if (!user) return;
    const password = resetPasswordValue.value;

    if (!password.trim()) {
        toast.error(t("settings.users.errors.newPasswordRequired"));
        return;
    }

    if (!isValidPassword(password)) {
        toast.error(t("settings.users.errors.passwordLength", {min: PASSWORD_MIN_LENGTH}));
        return;
    }

    resettingId.value = user.id;
    try {
        await userStore.adminUpdateUserPassword(user.id, password);
        resetDialogUser.value = null;
        resetPasswordValue.value = "";
    } finally {
        resettingId.value = null;
    }
}

async function copyUserId(id: string) {
    if (!isSupported.value) {
        toast.error(t("settings.users.errors.clipboardUnsupported"));
        return;
    }

    try {
        await copy(id);
        toast.success(t("settings.users.toasts.uuidCopied"));
    } catch {
        toast.error(t("settings.users.errors.copyUuidFailed"));
    }
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto flex h-[calc(100dvh-4rem-1.5rem)] w-full max-w-6xl flex-col py-6">
            <div class="mb-6 shrink-0">
                <div class="flex items-center gap-3">
                    <Icon class="icon-lg text-primary shrink-0" name="iconoir:user-crown" />
                    <div>
                        <h1 class="text-2xl font-semibold">{{ t("settings.users.title") }}</h1>
                        <p class="text-muted-foreground text-sm">{{ t("settings.users.subtitle") }}</p>
                    </div>
                </div>
            </div>

            <div class="flex min-h-0 flex-1 flex-col space-y-4">
                <div class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                        v-model="globalFilter"
                        class="w-full sm:max-w-sm"
                        :placeholder="t('settings.users.searchPlaceholder')" />
                </div>

                <div v-if="loading" class="text-muted-foreground text-sm">{{ t("common.loading") }}</div>

                <ScrollArea v-else class="min-h-0 flex-1 overflow-hidden rounded-md border" scrollbar-class="pt-[41px]">
                    <Table wrapperClass="overflow-visible pr-3">
                        <TableHeader class="bg-muted sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                            <TableRow
                                v-for="headerGroup in table.getHeaderGroups()"
                                :key="headerGroup.id"
                                class="border-b">
                                <TableHead
                                    v-for="(header, index) in headerGroup.headers"
                                    :key="header.id"
                                    :class="[
                                        header.column.id === 'actions' ? 'w-14 text-right' : '',
                                        index === headerGroup.headers.length - 1 ? 'relative w-[calc(100%+12px)]' : '',
                                    ]">
                                    <div v-if="header.isPlaceholder" />
                                    <Button
                                        v-else-if="header.column.getCanSort()"
                                        class="-ml-2 h-8 px-2"
                                        size="sm"
                                        variant="ghost"
                                        @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')">
                                        <FlexRender
                                            :props="header.getContext()"
                                            :render="header.column.columnDef.header" />
                                        <Icon
                                            v-if="header.column.getIsSorted() === 'asc'"
                                            class="ml-2 h-4 w-4"
                                            name="iconoir:nav-arrow-up" />
                                        <Icon
                                            v-else-if="header.column.getIsSorted() === 'desc'"
                                            class="ml-2 h-4 w-4"
                                            name="iconoir:nav-arrow-down" />
                                        <Icon
                                            v-else
                                            class="text-muted-foreground/50 ml-2 h-4 w-4"
                                            name="iconoir:arrow-separate-vertical" />
                                    </Button>
                                    <div v-else class="text-right">{{ t("common.actions") }}</div>
                                    <!-- Background extension for the last column to cover the gap -->
                                    <div
                                        v-if="index === headerGroup.headers.length - 1"
                                        class="bg-muted absolute top-0 right-[-12px] h-full w-[12px] border-b shadow-[0_1px_0_hsl(var(--border))]"></div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                                    <span
                                        v-if="cell.column.id === 'id'"
                                        :title="String(row.getValue('id'))"
                                        class="text-muted-foreground block max-w-[260px] truncate font-mono text-xs">
                                        {{ row.getValue("id") }}
                                    </span>

                                    <div v-else-if="cell.column.id === 'actions'" class="flex justify-end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger as-child>
                                                <Button class="h-8 w-8 p-0" size="icon" variant="ghost">
                                                    <MoreHorizontal class="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" class="w-48">
                                                <DropdownMenuItem @click="openDetailsDialog(row.original)">
                                                    <Eye class="h-4 w-4" />
                                                    {{ t("settings.users.viewDetails") }}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem @click="copyUserId(row.original.id)">
                                                    <Copy class="h-4 w-4" />
                                                    {{ t("settings.users.copyUuid") }}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem @click="openResetDialog(row.original)">
                                                    <KeyRound class="h-4 w-4" />
                                                    {{ t("settings.users.resetPassword") }}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    :disabled="
                                                        row.original.id === instanceOwnerId ||
                                                        deletingId === row.original.id
                                                    "
                                                    variant="destructive"
                                                    @click="openDeleteDialog(row.original)">
                                                    <Trash2 class="h-4 w-4" />
                                                    {{ t("settings.users.deleteUser") }}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <FlexRender v-else :props="cell.getContext()" :render="cell.column.columnDef.cell" />
                                </TableCell>
                            </TableRow>

                            <TableRow v-if="table.getRowModel().rows.length === 0">
                                <TableCell :colspan="4" class="text-muted-foreground h-24 text-center">
                                    {{ t("settings.users.noUsers") }}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </div>
    </div>

    <Dialog :open="Boolean(detailsState)" @update:open="(open) => !open && (detailsState = null)">
        <DialogContent class="max-w-lg">
            <DialogHeader>
                <DialogTitle>{{ t("settings.users.detailsTitle") }}</DialogTitle>
                <DialogDescription>{{ t("settings.users.detailsDescription") }}</DialogDescription>
            </DialogHeader>
            <div v-if="detailsState" class="grid gap-3 text-sm">
                <div>
                    <p class="text-muted-foreground">{{ t("auth.common.username") }}</p>
                    <p class="font-medium">{{ detailsState.user.username }}</p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("auth.common.email") }}</p>
                    <p class="font-medium">{{ detailsState.user.email }}</p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.uuid") }}</p>
                    <div class="flex items-center gap-2">
                        <p
                            :title="detailsState.user.id"
                            class="text-muted-foreground max-w-65 truncate font-mono text-xs">
                            {{ detailsState.user.id }}
                        </p>
                        <Button
                            aria-label="Copy user UUID"
                            class="h-7 w-7"
                            size="icon"
                            variant="ghost"
                            @click="copyUserId(detailsState.user.id)">
                            <Copy class="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                <div class="border-t pt-3" />
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.familyRole") }}</p>
                    <p class="font-medium">
                        {{ getDetailsFamilyRoleLabel(detailsState) }}
                    </p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.familyId") }}</p>
                    <div v-if="detailsState.user.familyId" class="flex items-center gap-2">
                        <p
                            :title="detailsState.user.familyId"
                            class="text-muted-foreground max-w-65 truncate font-mono text-xs">
                            {{ detailsState.user.familyId }}
                        </p>
                        <Button
                            aria-label="Copy family UUID"
                            class="h-7 w-7"
                            size="icon"
                            variant="ghost"
                            @click="copyUserId(detailsState.user.familyId)">
                            <Copy class="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <p v-else class="font-medium">-</p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.familyName") }}</p>
                    <p class="font-medium">
                        {{ loadingDetails ? t("common.loading") : (detailsState.family?.name ?? "-") }}
                    </p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.familyCurrency") }}</p>
                    <p class="font-medium">
                        {{ loadingDetails ? t("common.loading") : (detailsState.family?.currency ?? "-") }}
                    </p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.users.familyOwner") }}</p>
                    <p class="font-medium">
                        {{ loadingDetails ? t("common.loading") : (detailsState.family?.owner?.username ?? "-") }}
                    </p>
                </div>
                <div>
                    <p class="text-muted-foreground">{{ t("settings.family.members") }}</p>
                    <p class="font-medium">
                        {{
                            loadingDetails
                                ? t("common.loading")
                                : detailsState.family
                                  ? (detailsState.family.members?.length as number) + 1
                                  : "-"
                        }}
                    </p>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" @click="detailsState = null">{{ t("common.close") }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog :open="Boolean(resetDialogUser)" @update:open="(open) => !open && (resetDialogUser = null)">
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t("settings.users.resetPassword") }}</DialogTitle>
                <DialogDescription v-if="resetDialogUser">
                    {{ t("settings.users.resetPasswordFor", {username: resetDialogUser.username}) }}
                </DialogDescription>
            </DialogHeader>
            <div class="grid gap-2">
                <Input v-model="resetPasswordValue" :placeholder="t('settings.users.newPassword')" type="password" />
            </div>
            <DialogFooter>
                <Button variant="outline" @click="resetDialogUser = null">{{ t("common.cancel") }}</Button>
                <Button :disabled="isResettingCurrentUser" @click="handleResetPassword">
                    <span v-if="!isResettingCurrentUser">{{ t("settings.users.resetPassword") }}</span>
                    <span v-else>{{ t("settings.users.resetting") }}</span>
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <AlertDialog :open="Boolean(deleteDialogUser)" @update:open="(open) => !open && (deleteDialogUser = null)">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{{ t("settings.users.deleteUser") }}</AlertDialogTitle>
                <AlertDialogDescription v-if="deleteDialogUser">
                    {{
                        t("settings.users.deletePromptWithName", {
                            username: deleteDialogUser.username,
                        })
                    }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                <Button
                    :disabled="
                        Boolean(
                            deleteDialogUser &&
                            (deleteDialogUser.id === instanceOwnerId || deletingId === deleteDialogUser.id),
                        )
                    "
                    variant="destructive"
                    @click="handleDelete"
                    >{{ t("common.delete") }}</Button
                >
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
