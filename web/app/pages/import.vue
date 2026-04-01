<script setup lang="ts">
import {useRouter} from "vue-router";

const router = useRouter();

function handleDone() {
    router.push("/transactions");
}
</script>

<template>
    <div class="h-[calc(100dvh-4rem-1.5rem)]">
        <ClientOnly fallback-tag="div" fallback="Loading...">
            <ImportWizard @done="handleDone" />
        </ClientOnly>
    </div>
</template>
