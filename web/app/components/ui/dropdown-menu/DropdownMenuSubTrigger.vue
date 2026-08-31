<script setup lang="ts">
import type {DropdownMenuSubTriggerProps} from "reka-ui";

import type {HTMLAttributes} from "vue";
import {ChevronRightIcon} from "@lucide/vue";
import {reactiveOmit} from "@vueuse/core";
import {DropdownMenuSubTrigger, useForwardProps} from "reka-ui";
import {cn} from "@/lib/utils";

const props = defineProps<DropdownMenuSubTriggerProps & {class?: HTMLAttributes["class"]; inset?: boolean}>();

const delegatedProps = reactiveOmit(props, "class", "inset");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
    <DropdownMenuSubTrigger
        data-slot="dropdown-menu-sub-trigger"
        :data-inset="inset ? '' : undefined"
        v-bind="forwardedProps"
        :class="
            cn(
                'focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
                props.class,
            )
        ">
        <slot />
        <ChevronRightIcon class="cn-rtl-flip ml-auto" />
    </DropdownMenuSubTrigger>
</template>
