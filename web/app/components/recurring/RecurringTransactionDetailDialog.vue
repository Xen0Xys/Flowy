<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import {
    type ListExecutionsResult,
    type RecurrenceFrequency,
    type RecurringTransaction,
    useRecurringTransactionStore,
} from "~/stores/recurring-transaction.store";
import {useAccountStore} from "~/stores/account.store";
import {toCurrency} from "~/lib/currency";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Alert, AlertDescription, AlertTitle} from "~/components/ui/alert";
import {Badge} from "~/components/ui/badge";
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

const props = defineProps<{
    open: boolean;
    recurringTransaction: RecurringTransaction | null;
    currency: string;
}>();

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "edit", rt: RecurringTransaction): void;
    (e: "deleted"): void;
}>();

const {t, locale} = useI18n();
const store = useRecurringTransactionStore();
const accountStore = useAccountStore();
const router = useRouter();

const currentTab = ref<"details" | "history">("details");
const executions = ref<ListExecutionsResult | null>(null);
const isLoadingExecutions = ref(false);
const isDeleteOpen = ref(false);
const isDeleting = ref(false);

const rt = computed(() => props.recurringTransaction);
const accountName = computed(() => {
    if (!rt.value) return "";
    return accountStore.accounts.find((a) => a.id === rt.value?.accountId)?.name ?? "";
});

const MONTH_KEYS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
const MONTH_INTERVAL: Record<RecurrenceFrequency, number> = {
    WEEKLY: 0,
    MONTHLY: 1,
    BIMONTHLY: 2,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    YEARLY: 12,
};

const monthLabel = (m: number) => t(`recurring.monthOfYear.${MONTH_KEYS[m - 1]}`);

const dayLabel = computed(() => {
    if (!rt.value) return "";
    const r = rt.value;
    if (r.frequency === "WEEKLY") {
        const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        return t(`recurring.dayOfWeek.${keys[r.dayOfWeek ?? 0]}`);
    }
    const interval = MONTH_INTERVAL[r.frequency];
    if (interval > 1 && r.monthOfYear !== null) {
        if (r.frequency === "YEARLY") return `${r.dayOfMonth} ${monthLabel(r.monthOfYear)}`;
        const months: number[] = [];
        for (let m = r.monthOfYear; m <= 12; m += interval) months.push(m);
        return `${r.dayOfMonth} (${months.map(monthLabel).join(", ")})`;
    }
    return `${t("recurring.list.day")} ${r.dayOfMonth}`;
});

const formatDateTime = (iso: string, tz?: string) => {
    try {
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {
            timeZone: tz,
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(iso));
    } catch {
        return new Date(iso).toLocaleString();
    }
};

const formatDate = (iso: string, tz?: string) => {
    try {
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {
            timeZone: tz,
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(iso));
    } catch {
        return new Date(iso).toLocaleDateString();
    }
};

async function loadExecutions() {
    if (!rt.value) return;
    isLoadingExecutions.value = true;
    try {
        executions.value = await store.fetchExecutions(rt.value.id, 1, 50);
    } finally {
        isLoadingExecutions.value = false;
    }
}

watch(
    () => [props.open, currentTab.value],
    ([open, tab]) => {
        if (open && tab === "history" && !executions.value) {
            void loadExecutions();
        }
    },
);

watch(
    () => props.open,
    (open) => {
        if (open) {
            currentTab.value = "details";
            executions.value = null;
        }
    },
);

const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
    if (status === "CREATED") return "default";
    if (status === "FAILED") return "destructive";
    return "secondary";
};

async function handleDelete() {
    if (!rt.value) return;
    isDeleting.value = true;
    try {
        await store.remove(rt.value.id);
        isDeleteOpen.value = false;
        emit("update:open", false);
        emit("deleted");
    } finally {
        isDeleting.value = false;
    }
}

function goToTransaction(transactionId: string) {
    router.push(`/transactions?highlight=${transactionId}`);
    emit("update:open", false);
}
</script>

<template>
    <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
        <DialogContent v-if="rt" class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <span class="truncate">{{ rt.name }}</span>
                    <Badge v-if="!rt.isEnabled" variant="secondary">{{ t("recurring.list.disabled") }}</Badge>
                </DialogTitle>
            </DialogHeader>

            <Alert v-if="rt.isFailing" variant="destructive">
                <Icon class="size-4" name="iconoir:warning-triangle" />
                <AlertTitle>{{ t("recurring.detail.failingTitle") }}</AlertTitle>
                <AlertDescription>{{ t("recurring.detail.failingDescription") }}</AlertDescription>
            </Alert>

            <Tabs v-model="currentTab">
                <TabsList>
                    <TabsTrigger value="details">{{ t("recurring.detail.tabDetails") }}</TabsTrigger>
                    <TabsTrigger value="history">{{ t("recurring.detail.tabHistory") }}</TabsTrigger>
                </TabsList>

                <TabsContent value="details" class="flex flex-col gap-3 pt-4">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.amount") }}</p>
                            <p
                                :class="[
                                    'font-semibold tabular-nums',
                                    rt.amount < 0 ? 'text-destructive' : 'text-success',
                                ]">
                                {{ toCurrency(rt.amount, currency) }}
                            </p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.account") }}</p>
                            <p class="font-medium">{{ accountName }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.category") }}</p>
                            <p v-if="rt.category" class="flex items-center gap-1" :style="{color: rt.category.hexColor}">
                                <Icon :name="rt.category.icon" class="size-4" />
                                {{ rt.category.name }}
                            </p>
                            <p v-else class="text-muted-foreground">{{ t("common.none") }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.merchant") }}</p>
                            <p v-if="rt.merchant">{{ rt.merchant.name }}</p>
                            <p v-else class="text-muted-foreground">{{ t("common.none") }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.frequency") }}</p>
                            <p class="font-medium">
                                {{ t(`recurring.frequency.${rt.frequency.toLowerCase()}`) }} · {{ dayLabel }}
                            </p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.timezone") }}</p>
                            <p class="font-mono text-xs">{{ rt.timezone }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.nextRun") }}</p>
                            <p class="font-medium">{{ formatDateTime(rt.nextRunAt, rt.timezone) }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.lastRun") }}</p>
                            <p v-if="rt.lastRunAt" class="font-medium">
                                {{ formatDateTime(rt.lastRunAt, rt.timezone) }}
                            </p>
                            <p v-else class="text-muted-foreground">{{ t("recurring.detail.never") }}</p>
                        </div>
                        <div>
                            <p class="text-muted-foreground text-xs">{{ t("recurring.detail.inBudget") }}</p>
                            <p class="font-medium">
                                {{ rt.inBudget ? t("common.yes") : t("common.no") }}
                            </p>
                        </div>
                    </div>

                    <div class="flex items-center justify-end gap-2 pt-3">
                        <Button
                            variant="outline"
                            class="text-destructive hover:bg-destructive/10"
                            @click="isDeleteOpen = true">
                            <Icon class="size-4" name="iconoir:trash" />
                            {{ t("common.delete") }}
                        </Button>
                        <Button @click="emit('edit', rt)">
                            <Icon class="size-4" name="iconoir:edit-pencil" />
                            {{ t("common.edit") }}
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="history" class="flex flex-col gap-2 pt-4">
                    <p v-if="isLoadingExecutions" class="text-muted-foreground text-sm">{{ t("common.loading") }}</p>
                    <p
                        v-else-if="!executions || executions.items.length === 0"
                        class="text-muted-foreground py-6 text-center text-sm">
                        {{ t("recurring.detail.noExecutions") }}
                    </p>
                    <div v-else class="flex flex-col gap-1">
                        <div
                            v-for="exec in executions.items"
                            :key="exec.id"
                            class="hover:bg-muted/50 flex items-center gap-3 rounded-md border p-2 text-sm">
                            <Badge :variant="statusBadgeVariant(exec.status)">
                                {{ t(`recurring.execution.status.${exec.status.toLowerCase()}`) }}
                            </Badge>
                            <div class="flex-1">
                                <p>{{ formatDate(exec.scheduledFor, rt.timezone) }}</p>
                                <p v-if="exec.errorMessage" class="text-destructive text-xs">{{ exec.errorMessage }}</p>
                            </div>
                            <Button
                                v-if="exec.transactionId"
                                size="sm"
                                variant="ghost"
                                @click="goToTransaction(exec.transactionId)">
                                {{ t("recurring.detail.viewTransaction") }}
                                <Icon class="ml-1 size-3" name="iconoir:arrow-right" />
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </DialogContent>

        <AlertDialog :open="isDeleteOpen" @update:open="(v) => (isDeleteOpen = v)">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{{ t("common.areYouSure") }}</AlertDialogTitle>
                    <AlertDialogDescription>{{ t("recurring.detail.deleteDescription") }}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        :disabled="isDeleting"
                        @click="handleDelete">
                        {{ isDeleting ? t("common.deleting") : t("common.delete") }}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </Dialog>
</template>
