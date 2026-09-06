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

const label = computed(() => {
    if (!isShared.value) return "";
    if (props.variant === "full") {
        return props.access === "write" ? t("account.share.badge.write") : t("account.share.badge.read");
    }
    return t("account.share.badge.short");
});

const tooltipText = computed(() =>
    props.access === "write" ? t("account.share.tooltip.write") : t("account.share.tooltip.read"),
);
</script>

<template>
    <TooltipProvider v-if="isShared" :delay-duration="150">
        <Tooltip>
            <TooltipTrigger as-child>
                <span
                    :aria-label="tooltipText"
                    class="border-primary/40 bg-primary/10 text-primary inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[0.65rem] leading-none font-medium">
                    <Icon class="size-3" name="iconoir:share-android" />
                    <span v-if="variant !== 'icon'">{{ label }}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top">{{ tooltipText }}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>
