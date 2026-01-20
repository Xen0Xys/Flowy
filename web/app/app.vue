<script lang="ts" setup>
import {Toaster} from "vue-sonner";
</script>

<template>
    <div class="bg-background min-h-screen">
        <NuxtLoadingIndicator />
        <Toaster close-button richColors />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>
