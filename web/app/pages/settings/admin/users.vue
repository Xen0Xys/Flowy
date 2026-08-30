<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {useClipboard} from "@vueuse/core";
import {
    type ColumnDef,
    columnFilteringFeature,
    columnVisibilityFeature,
    createFilteredRowModel,
    createSortedRowModel,
    filterFns,
    FlexRender,
    globalFilteringFeature,
    rowSortingFeature,
    sortFns,
    type SortingState,
    tableFeatures,
    useTable,
    type VisibilityState,
} from "@tanstack/vue-table";
import {Copy, Eye, EyeOff, KeyRound, MoreHorizontal, RefreshCw, Trash2} from "lucide-vue-next";
import {toast} from "vue-sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
import {valueUpdater} from "@/lib/table";
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
const columnVisibility = ref<VisibilityState>({id: false});

const detailsState = ref<DetailsState | null>(null);
const loadingDetails = ref(false);
const resetDialogUser = ref<AdminUser | null>(null);
const deleteDialogUser = ref<AdminUser | null>(null);
const resetPasswordValue = ref("");
const showResetPassword = ref(false);
const isResettingCurrentUser = computed(() =>
    Boolean(resetDialogUser.value && resettingId.value === resetDialogUser.value.id),
);

function computeInitials(name: string | undefined | null): string {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function getUserRoleLabel(user: AdminUser): string {
    if (user.id === instanceOwnerId.value) return t("settings.users.roles.instanceOwner");
    if (!user.familyId) return t("settings.users.roles.noFamily");
    if (user.familyRole === "ADMIN") return t("settings.users.roles.familyAdmin");
    return t("settings.users.roles.familyMember");
}

function getUserRoleVariant(user: AdminUser): "default" | "secondary" | "outline" {
    if (user.id === instanceOwnerId.value) return "default";
    if (!user.familyId) return "outline";
    if (user.familyRole === "ADMIN") return "secondary";
    return "outline";
}

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
        id: "role",
        header: t("settings.users.familyRole"),
        enableSorting: false,
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

const features = tableFeatures({
    rowSortingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    globalFilteringFeature,
    sortedRowModel: createSortedRowModel(),
    filteredRowModel: createFilteredRowModel(),
    sortFns,
    filterFns,
});

const table = useTable({
    features,
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
        get columnVisibility() {
            return columnVisibility.value;
        },
    },
    onGlobalFilterChange: (updater) => valueUpdater(updater, globalFilter),
    onSortingChange: (updater) => valueUpdater(updater, sorting),
    onColumnVisibilityChange: (updater) => valueUpdater(updater, columnVisibility),
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
    showResetPassword.value = false;
    resetDialogUser.value = user;
}

function openDeleteDialog(user: AdminUser) {
    deleteDialogUser.value = user;
}

function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    const length = Math.max(16, PASSWORD_MIN_LENGTH);
    const cryptoObj = (globalThis as any).crypto;
    let out = "";
    if (cryptoObj?.getRandomValues) {
        const values = new Uint32Array(length);
        cryptoObj.getRandomValues(values);
        for (let i = 0; i < length; i++) {
            out += chars[(values[i] ?? 0) % chars.length];
        }
    } else {
        for (let i = 0; i < length; i++) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    resetPasswordValue.value = out;
    showResetPassword.value = true;
    toast.success(t("settings.users.toasts.passwordGenerated"));
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
    detailsState.value = {user, family: null};

    if (!user.familyId) return;

    loadingDetails.value = true;
    try {
        const family = await familyStore.adminGetFamily(user.familyId);
        if (!detailsState.value || detailsState.value.user.id !== user.id) return;
        detailsState.value = {user, family};
    } catch {
        if (!detailsState.value || detailsState.value.user.id !== user.id) return;
        detailsState.value = {user, family: null};
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
        showResetPassword.value = false;
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
        <div class="animate-fade-in-up mx-auto flex h-[calc(100dvh-4rem-1.5rem)] w-full max-w-6xl flex-col py-6">
            <div class="mb-6 shrink-0">
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <span
                            aria-hidden="true"
                            class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                        <div
                            class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                            <Icon class="text-primary size-6" name="iconoir:user-crown" />
                        </div>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <h1 class="font-heading text-2xl font-semibold tracking-tight">
                                {{ t("settings.users.title") }}
                            </h1>
                            <Badge v-if="!loading" variant="outline">
                                {{ t("settings.users.totalUsers", users.length) }}
                            </Badge>
                        </div>
                        <p class="text-muted-foreground text-sm">{{ t("settings.users.subtitle") }}</p>
                    </div>
                </div>
            </div>

            <div class="flex min-h-0 flex-1 flex-col space-y-4">
                <div class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="relative w-full sm:max-w-sm">
                        <Icon
                            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                            name="iconoir:search" />
                        <Input
                            v-model="globalFilter"
                            class="pl-9"
                            :placeholder="t('settings.users.searchPlaceholder')" />
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Icon class="size-4" name="iconoir:view-columns-3" />
                                {{ t("settings.users.columns") }}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{{ t("settings.users.columns") }}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                :model-value="table.getColumn('id')?.getIsVisible() ?? false"
                                @select.prevent
                                @update:model-value="
                                    (v: boolean) => table.getColumn('id')?.toggleVisibility(Boolean(v))
                                ">
                                {{ t("settings.users.showUuidColumn") }}
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div v-if="loading" class="text-muted-foreground text-sm">{{ t("common.loading") }}</div>

                <ScrollArea v-else class="min-h-0 flex-1 overflow-hidden rounded-md border">
                    <Table>
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
                                        header.column.id === 'role' ? 'w-40' : '',
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
                                            class="ml-2 size-4"
                                            name="iconoir:nav-arrow-up" />
                                        <Icon
                                            v-else-if="header.column.getIsSorted() === 'desc'"
                                            class="ml-2 size-4"
                                            name="iconoir:nav-arrow-down" />
                                        <Icon
                                            v-else
                                            class="text-muted-foreground/50 ml-2 size-4"
                                            name="iconoir:arrow-separate-vertical" />
                                    </Button>
                                    <div v-else-if="header.column.id === 'actions'" class="text-right">
                                        {{ t("common.actions") }}
                                    </div>
                                    <div v-else>
                                        <FlexRender
                                            :props="header.getContext()"
                                            :render="header.column.columnDef.header" />
                                    </div>
                                    <div
                                        v-if="index === headerGroup.headers.length - 1"
                                        class="bg-muted absolute top-0 right-[-12px] h-full w-[12px] border-b shadow-[0_1px_0_hsl(var(--border))]"></div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            <TableRow v-for="row in table.getRowModel().rows" :key="row.id" class="hover:bg-muted/40">
                                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                                    <div v-if="cell.column.id === 'username'" class="flex items-center gap-2">
                                        <Avatar class="size-7 shrink-0">
                                            <AvatarFallback class="text-[10px] font-semibold">
                                                {{ computeInitials(row.original.username) }}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span class="font-medium">{{ row.original.username }}</span>
                                    </div>

                                    <span
                                        v-else-if="cell.column.id === 'id'"
                                        :title="String(row.getValue('id'))"
                                        class="text-muted-foreground block max-w-[260px] truncate font-mono text-xs">
                                        {{ row.getValue("id") }}
                                    </span>

                                    <Badge
                                        v-else-if="cell.column.id === 'role'"
                                        :variant="getUserRoleVariant(row.original)">
                                        {{ getUserRoleLabel(row.original) }}
                                    </Badge>

                                    <div v-else-if="cell.column.id === 'actions'" class="flex justify-end">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button class="size-8 p-0" size="icon" variant="ghost">
                                                    <MoreHorizontal class="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" class="w-48">
                                                <DropdownMenuItem @click="openDetailsDialog(row.original)">
                                                    <Eye class="size-4" />
                                                    {{ t("settings.users.viewDetails") }}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem @click="copyUserId(row.original.id)">
                                                    <Copy class="size-4" />
                                                    {{ t("settings.users.copyUuid") }}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem @click="openResetDialog(row.original)">
                                                    <KeyRound class="size-4" />
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
                                                    <Trash2 class="size-4" />
                                                    {{ t("settings.users.deleteUser") }}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <FlexRender v-else :props="cell.getContext()" :render="cell.column.columnDef.cell" />
                                </TableCell>
                            </TableRow>

                            <TableRow v-if="table.getRowModel().rows.length === 0">
                                <TableCell :colspan="5" class="text-muted-foreground h-24 text-center">
                                    {{ t("settings.users.noUsers") }}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </div>

        <Dialog :open="Boolean(detailsState)" @update:open="(open) => !open && (detailsState = null)">
            <DialogContent class="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{{ t("settings.users.detailsTitle") }}</DialogTitle>
                    <DialogDescription>{{ t("settings.users.detailsDescription") }}</DialogDescription>
                </DialogHeader>
                <div v-if="detailsState" class="grid gap-6 sm:grid-cols-2">
                    <section class="space-y-3">
                        <div class="flex items-center gap-3">
                            <Avatar class="size-10">
                                <AvatarFallback class="text-sm font-semibold">
                                    {{ computeInitials(detailsState.user.username) }}
                                </AvatarFallback>
                            </Avatar>
                            <div class="min-w-0">
                                <p class="truncate text-sm font-medium">{{ detailsState.user.username }}</p>
                                <p class="text-muted-foreground truncate text-xs">{{ detailsState.user.email }}</p>
                            </div>
                        </div>
                        <Badge :variant="getUserRoleVariant(detailsState.user)">
                            {{ getUserRoleLabel(detailsState.user) }}
                        </Badge>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("settings.users.uuid") }}</p>
                            <div class="flex items-center gap-2">
                                <p
                                    :title="detailsState.user.id"
                                    class="text-muted-foreground max-w-56 truncate font-mono text-xs">
                                    {{ detailsState.user.id }}
                                </p>
                                <Button
                                    aria-label="Copy user UUID"
                                    class="size-6"
                                    size="icon"
                                    variant="ghost"
                                    @click="copyUserId(detailsState.user.id)">
                                    <Copy class="size-3" />
                                </Button>
                            </div>
                        </div>
                    </section>

                    <section class="space-y-3">
                        <p class="text-muted-foreground text-xs tracking-wide uppercase">
                            {{ t("settings.users.familyInfo") }}
                        </p>
                        <template v-if="detailsState.user.familyId">
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.users.familyName") }}</p>
                                <p class="text-sm font-medium">
                                    {{ loadingDetails ? t("common.loading") : (detailsState.family?.name ?? "-") }}
                                </p>
                            </div>
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.users.familyRole") }}</p>
                                <p class="text-sm font-medium">{{ getDetailsFamilyRoleLabel(detailsState) }}</p>
                            </div>
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.users.familyCurrency") }}</p>
                                <p class="text-sm font-medium">
                                    {{ loadingDetails ? t("common.loading") : (detailsState.family?.currency ?? "-") }}
                                </p>
                            </div>
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.users.familyOwner") }}</p>
                                <p class="text-sm font-medium">
                                    {{
                                        loadingDetails
                                            ? t("common.loading")
                                            : (detailsState.family?.owner?.username ?? "-")
                                    }}
                                </p>
                            </div>
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.family.members") }}</p>
                                <p class="text-sm font-medium">
                                    {{
                                        loadingDetails
                                            ? t("common.loading")
                                            : detailsState.family
                                              ? (detailsState.family.members?.length as number) + 1
                                              : "-"
                                    }}
                                </p>
                            </div>
                            <div>
                                <p class="text-muted-foreground text-xs">{{ t("settings.users.familyId") }}</p>
                                <div class="flex items-center gap-2">
                                    <p
                                        :title="detailsState.user.familyId"
                                        class="text-muted-foreground max-w-56 truncate font-mono text-xs">
                                        {{ detailsState.user.familyId }}
                                    </p>
                                    <Button
                                        aria-label="Copy family UUID"
                                        class="size-6"
                                        size="icon"
                                        variant="ghost"
                                        @click="copyUserId(detailsState.user.familyId)">
                                        <Copy class="size-3" />
                                    </Button>
                                </div>
                            </div>
                        </template>
                        <p v-else class="text-muted-foreground text-sm">
                            {{ t("settings.users.roles.noFamily") }}
                        </p>
                    </section>
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
                <div class="space-y-2">
                    <Label for="reset-password-input">{{ t("settings.users.newPassword") }}</Label>
                    <div class="flex items-center gap-2">
                        <div class="relative flex-1">
                            <Input
                                id="reset-password-input"
                                v-model="resetPasswordValue"
                                :placeholder="t('settings.users.newPassword')"
                                :type="showResetPassword ? 'text' : 'password'"
                                class="pr-10 font-mono" />
                            <Button
                                :aria-label="
                                    showResetPassword
                                        ? t('settings.users.hidePassword')
                                        : t('settings.users.showPassword')
                                "
                                class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                                size="icon"
                                type="button"
                                variant="ghost"
                                @click="showResetPassword = !showResetPassword">
                                <Eye v-if="!showResetPassword" class="size-4" />
                                <EyeOff v-else class="size-4" />
                            </Button>
                        </div>
                        <Button
                            :aria-label="t('settings.users.generatePassword')"
                            size="icon"
                            variant="outline"
                            @click="generatePassword">
                            <RefreshCw class="size-4" />
                        </Button>
                    </div>
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
                        {{ t("settings.users.deletePromptWithName", {username: deleteDialogUser.username}) }}
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
                        @click="handleDelete">
                        {{ t("common.delete") }}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>

<style scoped>
:deep([data-slot="table-container"]) {
    overflow: visible;
    padding-right: 0.75rem;
}
:deep([data-slot="scroll-area-scrollbar"][data-orientation="vertical"]) {
    padding-top: 41px;
}
</style>
