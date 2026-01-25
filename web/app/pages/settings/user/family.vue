<script setup lang="ts">
import {useUserStore} from "~/stores/user.store";

const userStore = useUserStore();
</script>

<template>
    <div>
        <h2>Family</h2>
        <div v-if="!userStore.hasFamily">Vous n'avez pas de famille</div>
        <div v-else>Family settings placeholder</div>
    </div>
</template>
