<script setup lang="ts">
import type {HTMLAttributes} from "vue";
import {cn} from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        data-slot="alert-description"
        :class="
            cn(
                'text-muted-foreground [&_a]:hover:text-foreground text-sm text-balance md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4',
                props.class,
            )
        ">
        <slot />
    </div>
</template>
