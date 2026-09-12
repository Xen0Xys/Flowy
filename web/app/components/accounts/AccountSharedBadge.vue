<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";
import type {AccountAccess} from "~/stores/account.store";

const props = withDefaults(
    defineProps<{
        access: AccountAccess;
        variant?: "full" | "short" | "icon";
    }>(),
    {
        variant: "short",
    },
);

const {t} = useI18n();

const isShared = computed(() => props.access !== "owner");
const isWrite = computed(() => props.access === "write");

const iconName = computed(() => (isWrite.value ? "iconoir:edit-pencil" : "iconoir:eye"));

const label = computed(() => {
    if (!isShared.value) return "";
    if (props.variant === "full") {
        return isWrite.value ? t("account.share.badge.write") : t("account.share.badge.read");
    }
    return t("account.share.badge.short");
});

const tooltipText = computed(() => (isWrite.value ? t("account.share.tooltip.write") : t("account.share.tooltip.read")));

const pillClass = computed(() =>
    isWrite.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground",
);
</script>

<template>
    <TooltipProvider v-if="isShared" :delay-duration="150">
        <Tooltip>
            <TooltipTrigger as-child>
                <span
                    :aria-label="tooltipText"
                    :class="[
                        pillClass,
                        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[0.65rem] leading-none font-medium',
                    ]">
                    <Icon class="size-3" :name="iconName" />
                    <span v-if="variant !== 'icon'">{{ label }}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top">{{ tooltipText }}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>
