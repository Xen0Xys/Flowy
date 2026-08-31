<script setup lang="ts">
import type {HTMLAttributes} from "vue";
import {cn} from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        data-slot="avatar-group"
        :class="
            cn(
                'group/avatar-group *:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2',
                props.class,
            )
        ">
        <slot />
    </div>
</template>
