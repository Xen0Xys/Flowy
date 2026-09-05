<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "#components";
import {
    type RecurringCalendar,
    type RecurringTransaction,
    useRecurringTransactionStore,
} from "~/stores/recurring-transaction.store";
import {useAccountStore} from "~/stores/account.store";
import {useReferenceStore} from "~/stores/reference.store";
import {useFamilyStore} from "~/stores/family.store";
import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import RecurringTransactionListView from "~/components/recurring/RecurringTransactionListView.vue";
import RecurringTransactionCalendarView from "~/components/recurring/RecurringTransactionCalendarView.vue";
import RecurringTransactionFormDialog from "~/components/recurring/RecurringTransactionFormDialog.vue";
import RecurringTransactionDetailDialog from "~/components/recurring/RecurringTransactionDetailDialog.vue";

const {t, locale} = useI18n();
const store = useRecurringTransactionStore();
const accountStore = useAccountStore();
const referenceStore = useReferenceStore();
const familyStore = useFamilyStore();
const route = useRoute();
const router = useRouter();

type ViewMode = "list" | "calendar";

const VIEW_MODE_STORAGE_KEY = "flowy.recurring.viewMode";

const currentView = computed<ViewMode>(() => (route.query.view === "calendar" ? "calendar" : "list"));

function setView(view: ViewMode) {
    router.replace({query: {...route.query, view}});
    if (process.client) {
        try {
            window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
        } catch {
            // Ignore storage failures (e.g. disabled storage / private mode)
        }
    }
}

const now = new Date();

function parsePeriod(value: unknown): {month: number; year: number} {
    const fallback = {month: now.getMonth() + 1, year: now.getFullYear()};
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") return fallback;
    const match = /^(\d{4})-(\d{2})$/.exec(raw);
    if (!match) return fallback;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || year < 1900 || year > 2200) return fallback;
    if (!Number.isFinite(month) || month < 1 || month > 12) return fallback;
    return {month, year};
}

function formatPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, "0")}`;
}

const currentPeriod = computed(() => parsePeriod(route.query.period));

const isCurrentMonth = computed(() => {
    const today = new Date();
    return currentPeriod.value.year === today.getFullYear() && currentPeriod.value.month === today.getMonth() + 1;
});

function setPeriod(year: number, month: number) {
    const period = formatPeriod(year, month);
    if (route.query.period === period) return;
    router.replace({query: {...route.query, period}});
}

function goToday() {
    const today = new Date();
    setPeriod(today.getFullYear(), today.getMonth() + 1);
}

const isLoading = ref(true);
const calendar = ref<RecurringCalendar | null>(null);

const isFormOpen = ref(false);
const editingRt = ref<RecurringTransaction | null>(null);

const isDetailOpen = ref(false);
const selectedRt = ref<RecurringTransaction | null>(null);

const currency = computed(() => familyStore.family?.currency ?? "USD");
const items = computed(() => store.items);

async function loadList() {
    await store.fetchAll();
}

async function loadCalendar() {
    calendar.value = await store.fetchCalendar(currentPeriod.value.year, currentPeriod.value.month);
}

async function refreshAll() {
    isLoading.value = true;
    try {
        await Promise.all([loadList(), loadCalendar()]);
    } finally {
        isLoading.value = false;
    }
}

onMounted(async () => {
    if (process.client && route.query.view !== "list" && route.query.view !== "calendar") {
        try {
            const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
            if (stored === "calendar") {
                setView("calendar");
            }
        } catch {
            // Ignore storage failures (e.g. disabled storage / private mode)
        }
    }
    await Promise.all([
        accountStore.fetchAccounts().catch(() => null),
        referenceStore.fetchReferences().catch(() => null),
        familyStore.fetchFamily().catch(() => null),
    ]);
    await refreshAll();
});

watch(
    () => currentPeriod.value,
    async () => {
        if (currentView.value === "calendar") {
            try {
                calendar.value = await store.fetchCalendar(currentPeriod.value.year, currentPeriod.value.month);
            } catch {
                // ignore
            }
        }
    },
);

const monthLabel = computed(() => {
    try {
        return new Intl.DateTimeFormat(locale.value ?? "en-US", {month: "long", year: "numeric"}).format(
            new Date(currentPeriod.value.year, currentPeriod.value.month - 1, 1),
        );
    } catch {
        return `${currentPeriod.value.month}/${currentPeriod.value.year}`;
    }
});

function navigateMonth(direction: -1 | 1) {
    let m = currentPeriod.value.month + direction;
    let y = currentPeriod.value.year;
    if (m < 1) {
        m = 12;
        y -= 1;
    } else if (m > 12) {
        m = 1;
        y += 1;
    }
    setPeriod(y, m);
}

function openCreate() {
    editingRt.value = null;
    isFormOpen.value = true;
}

function handleSelect(rt: RecurringTransaction) {
    selectedRt.value = rt;
    isDetailOpen.value = true;
}

async function handleToggle(rt: RecurringTransaction, value: boolean) {
    try {
        await store.toggle(rt.id, value);
        await loadCalendar();
    } catch {
        // toast handled in store
    }
}

function handleEdit(rt: RecurringTransaction) {
    editingRt.value = rt;
    isDetailOpen.value = false;
    isFormOpen.value = true;
}

async function handleSaved() {
    await refreshAll();
}

async function handleDeleted() {
    await refreshAll();
}
</script>

<template>
    <div class="w-full">
        <div class="mx-auto max-w-7xl">
            <div class="flex flex-col gap-6">
                <div class="flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <span
                                aria-hidden="true"
                                class="bg-brand-gradient-soft absolute inset-0 rounded-xl blur-md"></span>
                            <div
                                class="bg-brand-gradient-soft border-border/60 relative flex size-12 items-center justify-center rounded-xl border">
                                <Icon class="text-primary size-6" name="iconoir:refresh-double" />
                            </div>
                        </div>
                        <div>
                            <h1 class="font-heading text-2xl font-semibold tracking-tight">
                                {{ t("recurring.page.title") }}
                            </h1>
                            <p class="text-muted-foreground text-sm">{{ t("recurring.page.subtitle") }}</p>
                        </div>
                    </div>
                    <Button class="w-full md:w-auto" @click="openCreate">
                        <Icon class="mr-2 size-4" name="iconoir:plus" />
                        {{ t("recurring.page.new") }}
                    </Button>
                </div>

                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Tabs :model-value="currentView" @update:model-value="(v) => setView(v as ViewMode)">
                        <TabsList>
                            <TabsTrigger value="list">
                                <Icon class="mr-1 size-4" name="iconoir:list" />
                                {{ t("recurring.page.viewList") }}
                            </TabsTrigger>
                            <TabsTrigger value="calendar">
                                <Icon class="mr-1 size-4" name="iconoir:calendar" />
                                {{ t("recurring.page.viewCalendar") }}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div v-if="currentView === 'calendar'" class="flex items-center gap-2">
                        <Button size="icon" variant="ghost" @click="navigateMonth(-1)">
                            <Icon class="size-4" name="iconoir:nav-arrow-left" />
                        </Button>
                        <span class="min-w-40 text-center text-sm font-medium">{{ monthLabel }}</span>
                        <Button size="icon" variant="ghost" @click="navigateMonth(1)">
                            <Icon class="size-4" name="iconoir:nav-arrow-right" />
                        </Button>
                        <Button :disabled="isCurrentMonth" size="sm" variant="outline" class="ml-1" @click="goToday">
                            <Icon class="mr-1 size-4" name="iconoir:calendar" />
                            {{ t("recurring.page.today") }}
                        </Button>
                    </div>
                </div>

                <div v-if="isLoading" class="flex flex-col gap-3">
                    <Skeleton class="h-16 w-full" />
                    <Skeleton class="h-16 w-full" />
                    <Skeleton class="h-16 w-full" />
                </div>
                <template v-else>
                    <RecurringTransactionListView
                        v-if="currentView === 'list'"
                        :items="items"
                        :currency="currency"
                        @select="handleSelect"
                        @toggle="handleToggle" />
                    <RecurringTransactionCalendarView
                        v-else
                        :calendar="calendar"
                        :currency="currency"
                        @select="handleSelect" />
                </template>
            </div>
        </div>

        <RecurringTransactionFormDialog
            v-model:open="isFormOpen"
            :recurring-transaction="editingRt"
            @saved="handleSaved" />

        <RecurringTransactionDetailDialog
            v-model:open="isDetailOpen"
            :recurring-transaction="selectedRt"
            :currency="currency"
            @edit="handleEdit"
            @deleted="handleDeleted" />
    </div>
</template>
