<script lang="ts" setup>
import type {ScrollAreaRootProps} from "reka-ui";
import {ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport} from "reka-ui";
import type {HTMLAttributes} from "vue";
import {reactiveOmit} from "@vueuse/core";
import {cn} from "@/lib/utils";
import ScrollBar from "./ScrollBar.vue";

const props = defineProps<
    ScrollAreaRootProps & {
        class?: HTMLAttributes["class"];
        scrollbarClass?: HTMLAttributes["class"];
    }
>();

const delegatedProps = reactiveOmit(props, "class", "scrollbarClass");
</script>

<template>
    <ScrollAreaRoot :class="cn('relative', props.class)" data-slot="scroll-area" v-bind="delegatedProps">
        <ScrollAreaViewport
            class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
            data-slot="scroll-area-viewport">
            <slot />
        </ScrollAreaViewport>
        <ScrollBar :class="scrollbarClass" />
        <ScrollBar orientation="horizontal" />
        <ScrollAreaCorner />
    </ScrollAreaRoot>
</template>
