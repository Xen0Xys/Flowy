<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";

const props = withDefaults(
    defineProps<{
        sharesCount: number;
        variant?: "full" | "short" | "icon";
        clickable?: boolean;
    }>(),
    {
        variant: "short",
        clickable: false,
    },
);

const emit = defineEmits<{
    (e: "click"): void;
}>();

const {t} = useI18n();

const isVisible = computed(() => props.sharesCount > 0);

const label = computed(() => {
    if (props.variant === "full") {
        return t("account.share.ownerBadge.count", {count: props.sharesCount});
    }
    return t("account.share.ownerBadge.short");
});

const tooltipText = computed(() => t("account.share.ownerBadge.tooltip", {count: props.sharesCount}));

const baseClass =
    "border-accent/40 bg-accent/10 text-accent inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[0.65rem] leading-none font-medium";

const handleClick = () => {
    if (!props.clickable) return;
    emit("click");
};
</script>

<template>
    <TooltipProvider v-if="isVisible" :delay-duration="150">
        <Tooltip>
            <TooltipTrigger as-child>
                <button
                    v-if="clickable"
                    type="button"
                    :aria-label="tooltipText"
                    :class="[baseClass, 'hover:bg-accent/20 cursor-pointer transition-colors']"
                    @click.stop="handleClick">
                    <Icon class="size-3" name="iconoir:community" />
                    <span v-if="variant !== 'icon'">{{ label }}</span>
                    <span
                        v-if="variant === 'icon'"
                        class="bg-accent/25 flex size-3.5 items-center justify-center rounded-full text-[0.55rem] font-semibold tabular-nums">
                        {{ sharesCount }}
                    </span>
                </button>
                <span v-else :aria-label="tooltipText" :class="baseClass">
                    <Icon class="size-3" name="iconoir:community" />
                    <span v-if="variant !== 'icon'">{{ label }}</span>
                    <span
                        v-if="variant === 'icon'"
                        class="bg-accent/25 flex size-3.5 items-center justify-center rounded-full text-[0.55rem] font-semibold tabular-nums">
                        {{ sharesCount }}
                    </span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top">{{ tooltipText }}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>
