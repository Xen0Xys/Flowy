<script lang="ts" setup>
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import FlowySidebar from "~/components/sidebar/FlowySidebar.vue";
import {useRoute} from "vue-router";
import {computed} from "vue";

const route = useRoute();
const showSidebar = computed(() => {
    const p = route.path || "";
    return !(p.startsWith("/auth") || p.startsWith("/onboarding"));
});

const defaultOpen = useCookie<boolean>("sidebar_state");
</script>

<template>
    <main
        v-if="showSidebar"
        class="flex h-dvh max-h-dvh min-h-dvh w-full grow flex-col">
        <SidebarProvider :defaultOpen="defaultOpen">
            <SidebarWatcher />
            <FlowySidebar />
            <SidebarInset>
                <div class="flex h-full flex-col">
                    <header
                        class="bg-background flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger class="-ml-1" />
                        <Separator
                            class="mr-2 max-h-6"
                            orientation="vertical" />
                        <h3>Flowy</h3>
                    </header>
                    <div class="flex flex-1 flex-col overflow-y-auto p-4">
                        <slot />
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    </main>
    <main v-else class="flex h-dvh max-h-dvh min-h-dvh w-full grow flex-col">
        <slot></slot>
    </main>
</template>
