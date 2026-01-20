<script lang="ts" setup>
import "vue-sonner/style.css";
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
