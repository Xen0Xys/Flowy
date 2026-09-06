<script setup lang="ts">
import type {CheckboxRootEmits, CheckboxRootProps} from "reka-ui";

import type {HTMLAttributes} from "vue";
import {CheckIcon} from "@lucide/vue";
import {reactiveOmit} from "@vueuse/core";
import {CheckboxIndicator, CheckboxRoot, useForwardPropsEmits} from "reka-ui";
import {cn} from "@/lib/utils";

const props = defineProps<CheckboxRootProps & {class?: HTMLAttributes["class"]}>();
const emits = defineEmits<CheckboxRootEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
    <CheckboxRoot
        v-slot="slotProps"
        data-slot="checkbox"
        v-bind="forwarded"
        :class="
            cn(
                'border-input dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:border-primary aria-invalid:aria-checked:border-primary aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
                props.class,
            )
        ">
        <CheckboxIndicator
            data-slot="checkbox-indicator"
            class="grid place-content-center text-current transition-none [&>svg]:size-3.5">
            <slot v-bind="slotProps">
                <CheckIcon />
            </slot>
        </CheckboxIndicator>
    </CheckboxRoot>
</template>
