<script lang="ts" setup>
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import {Home, Settings} from "lucide-vue-next";
import {useRoute} from "vue-router";
import {computed} from "vue";

// Hide sidebar on routes where a sidebar is not logical (auth pages, onboarding, etc.)
const route = useRoute();
const showSidebar = computed(() => {
    const p = route.path || "";
    return !(p.startsWith("/auth") || p.startsWith("/onboarding"));
});
</script>

<template>
    <div class="flex min-h-screen bg-slate-50">
        <SidebarProvider v-if="showSidebar">
            <Sidebar>
                <SidebarHeader>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                        <Home class="size-4" />
                                    </div>
                                    <div class="grid flex-1">
                                        <span class="truncate font-semibold"
                                            >Flowy</span
                                        >
                                        <span class="truncate text-xs"
                                            >v1.0</span
                                        >
                                    </div>
                                </div>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>

                <SidebarContent>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton as-child>
                                <NuxtLink to="/">
                                    <Home />
                                    <span>Accueil</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarContent>

                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton as-child>
                                <NuxtLink to="/settings">
                                    <Settings />
                                    <span>Paramètres</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header class="flex h-16 shrink-0 items-center gap-2">
                    <div class="flex items-center gap-2 px-4">
                        <SidebarTrigger class="-ml-1" />
                    </div>
                </header>

                <main class="flex-1 p-6">
                    <NuxtPage />
                </main>
            </SidebarInset>
        </SidebarProvider>

        <div v-else class="flex-1">
            <NuxtPage />
        </div>
    </div>
</template>
