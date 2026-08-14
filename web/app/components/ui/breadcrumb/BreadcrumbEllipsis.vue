<script lang="ts" setup>
import type {HTMLAttributes} from "vue";

import {MoreHorizontalIcon} from "@lucide/vue";
import {cn} from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <span
        data-slot="breadcrumb-ellipsis"
        role="presentation"
        aria-hidden="true"
        :class="cn('flex size-5 items-center justify-center [&>svg]:size-4', props.class)">
        <slot>
            <MoreHorizontalIcon />
        </slot>
        <span class="sr-only">More</span>
    </span>
</template>
