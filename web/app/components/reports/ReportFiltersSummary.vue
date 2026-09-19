<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Button} from "~/components/ui/button";
import type {Account} from "~/stores/account.store";
import type {TransactionCategory, TransactionMerchant} from "~/stores/reference.store";
import type {BudgetedFilter} from "~/stores/report.store";

const props = defineProps<{
    accounts: Account[];
    categories: TransactionCategory[];
    merchants: TransactionMerchant[];
    accountIds: string[];
    categoryIds: string[];
    merchantIds: string[];
    includeShared: boolean;
    excludeTransfers: boolean;
    includeRebalances: boolean;
    budgeted: BudgetedFilter;
}>();

const emit = defineEmits<{
    "remove:account": [string];
    "remove:category": [string];
    "remove:merchant": [string];
    "reset:includeShared": [];
    "reset:excludeTransfers": [];
    "reset:includeRebalances": [];
    "reset:budgeted": [];
    "reset:all": [];
}>();

const {t} = useI18n();

const accountChips = computed(() =>
    props.accountIds.map((id) => {
        const account = props.accounts.find((a) => a.id === id);
        return {id, name: account?.name ?? id};
    }),
);

const categoryChips = computed(() =>
    props.categoryIds.map((id) => {
        const category = props.categories.find((c) => c.id === id);
        return {id, name: category?.name ?? id, color: category?.hexColor};
    }),
);

const merchantChips = computed(() =>
    props.merchantIds.map((id) => {
        const merchant = props.merchants.find((m) => m.id === id);
        return {id, name: merchant?.name ?? id};
    }),
);
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <button
            v-for="chip in accountChips"
            :key="`acc-${chip.id}`"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('remove:account', chip.id)">
            <Icon class="text-muted-foreground size-3" name="iconoir:wallet" />
            <span class="max-w-[10rem] truncate">{{ chip.name }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-for="chip in categoryChips"
            :key="`cat-${chip.id}`"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('remove:category', chip.id)">
            <span
                v-if="chip.color"
                class="inline-block size-2 shrink-0 rounded-full"
                :style="{backgroundColor: chip.color}"></span>
            <Icon v-else class="text-muted-foreground size-3" name="iconoir:pizza-slice" />
            <span class="max-w-[10rem] truncate">{{ chip.name }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-for="chip in merchantChips"
            :key="`mer-${chip.id}`"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('remove:merchant', chip.id)">
            <Icon class="text-muted-foreground size-3" name="iconoir:shop" />
            <span class="max-w-[10rem] truncate">{{ chip.name }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-if="!includeShared"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('reset:includeShared')">
            <Icon class="text-muted-foreground size-3" name="iconoir:eye-closed" />
            <span>{{ t("reports.filters.chips.excludeShared") }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-if="excludeTransfers"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('reset:excludeTransfers')">
            <Icon class="text-muted-foreground size-3" name="iconoir:data-transfer-both" />
            <span>{{ t("reports.filters.excludeTransfers") }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-if="includeRebalances"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('reset:includeRebalances')">
            <Icon class="text-muted-foreground size-3" name="iconoir:refresh" />
            <span>{{ t("reports.filters.includeRebalances") }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <button
            v-if="budgeted !== 'all'"
            type="button"
            class="border-border/60 bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
            @click="emit('reset:budgeted')">
            <Icon class="text-muted-foreground size-3" name="iconoir:piggy-bank" />
            <span>{{ t(`reports.filters.budgeted.${budgeted}`) }}</span>
            <Icon class="text-muted-foreground size-3" name="iconoir:xmark" />
        </button>

        <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground ml-auto h-7 gap-1.5 text-xs"
            @click="emit('reset:all')">
            <Icon class="size-3.5" name="iconoir:erase" />
            {{ t("reports.filters.resetAll") }}
        </Button>
    </div>
</template>
