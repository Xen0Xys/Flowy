<script lang="ts" setup>
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import FlowySidebar from "~/components/sidebar/FlowySidebar.vue";
import AppBreadcrumb from "~/components/layout/AppBreadcrumb.vue";
import CommandPalette from "~/components/layout/CommandPalette.vue";

const defaultOpen = useCookie<boolean>("sidebar_state");
</script>

<template>
    <main class="flex h-dvh w-full grow flex-col">
        <SidebarProvider :defaultOpen="defaultOpen">
            <SidebarWatcher />
            <CommandPalette />
            <FlowySidebar />
            <SidebarInset>
                <div class="flex h-full flex-col">
                    <header
                        class="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md">
                        <SidebarTrigger class="hover:bg-accent/20 -ml-1 transition-colors" />
                        <Separator class="mr-2 max-h-6" orientation="vertical" />
                        <AppBreadcrumb />
                    </header>
                    <div class="flex flex-1 flex-col overflow-y-auto p-4 md:p-6 md:pb-0">
                        <slot />
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    </main>
</template>
