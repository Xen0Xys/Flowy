<script setup lang="ts">
import {useRoute, useRouter} from "vue-router";

const route = useRoute();
const router = useRouter();

const accountId = route.params.id as string;

function handleDone() {
    router.push(`/account/${accountId}`);
}
</script>

<template>
    <div class="h-[calc(100dvh-4rem-1.5rem)]">
        <ClientOnly fallback-tag="div" fallback="Loading...">
            <ImportWizard :account-id="accountId" @done="handleDone" />
        </ClientOnly>
    </div>
</template>
