<script lang="ts" setup>
import {useSidebar} from "~/components/ui/sidebar";

const route = useRoute();
const {isMobile, setOpenMobile} = useSidebar();

watch(
    () => route.path,
    () => {
        if (isMobile.value) {
            setOpenMobile(false);
        }
    },
);
</script>

<template>
    <div style="display: none" />
</template>
