<script lang="ts" setup>
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "~/components/ui/sidebar";
import {computed, onMounted, ref, watch} from "vue";
import {useUserStore} from "~/stores/user.store";
import {cn} from "~/lib/utils";

const route = useRoute();
const isActiveFunction = (path: string) => route.path === path;
const inSettings = computed(() => route.path.startsWith("/settings"));

const config = useRuntimeConfig();
const version = computed(() => {
    return config.public.appVersion;
});

const footerLabel = computed(() => (inSettings.value ? "Menu" : "Settings"));

// show/hide instance/admin settings links depending on permissions
const userStore = useUserStore();
const showAdminLinks = ref(false);

async function computeAdminVisibility() {
    try {
        // the store getter is async and may call the admin endpoint
        // await the result and update local state
        showAdminLinks.value = !!(await userStore.isInstanceOwner);
    } catch (err) {
        // if any error occurs, be conservative and hide admin links
        showAdminLinks.value = false;
    }
}

onMounted(async () => {
    // compute once on client mount
    await computeAdminVisibility();
});

// recompute when token changes (login/logout)
watch(
    () => userStore.token,
    async (token) => {
        if (token) await computeAdminVisibility();
        else showAdminLinks.value = false;
    },
);
</script>

<template>
    <Sidebar>
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton as-child size="lg">
                        <div>
                            <div
                                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                <Icon name="iconoir:apple-shortcuts"></Icon>
                            </div>
                            <div class="flex flex-col gap-0.5 leading-none">
                                <span class="font-semibold">Flowy</span>
                                <span>{{ version }}</span>
                            </div>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup
                :aria-hidden="inSettings"
                :class="{hidden: inSettings}">
                <SidebarGroupLabel>Menu</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                :is-active="isActiveFunction('/')"
                                as-child>
                                <NuxtLink to="/">
                                    <Icon name="iconoir:home"></Icon>
                                    <span>Dashboard</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup
                :aria-hidden="!inSettings"
                :class="{hidden: !inSettings}">
                <SidebarGroupLabel>Settings</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <!-- User settings category -->
                        <SidebarMenuItem>
                            <SidebarMenuButton as-child>
                                <NuxtLink to="/settings/user/profile">
                                    <Icon name="iconoir:user"></Icon>
                                    Profile
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton as-child>
                                <NuxtLink to="/settings/user/family">
                                    <Icon name="iconoir:community"></Icon>
                                    Family</NuxtLink
                                >
                            </SidebarMenuButton>
                        </SidebarMenuItem>

                        <!-- Admin / Instance settings category -->
                        <template v-if="showAdminLinks">
                            <li
                                :class="
                                    cn(
                                        'text-muted-foreground mt-2 px-3 text-xs',
                                    )
                                "
                                aria-hidden="true">
                                Instance & Admin
                            </li>
                            <SidebarMenuItem>
                                <SidebarMenuButton as-child>
                                    <NuxtLink to="/settings/admin/instance">
                                        <Icon name="iconoir:server"></Icon>
                                        Instance</NuxtLink
                                    >
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton as-child>
                                    <NuxtLink to="/settings/admin/users">
                                        <Icon name="iconoir:user-crown"></Icon>
                                        Users</NuxtLink
                                    >
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </template>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton v-if="inSettings" as-child>
                        <NuxtLink to="/">
                            <Icon name="iconoir:home" />
                            <span>Menu</span>
                        </NuxtLink>
                    </SidebarMenuButton>
                    <SidebarMenuButton v-else as-child>
                        <NuxtLink to="/settings/user/profile">
                            <Icon name="iconoir:settings" />
                            <span>Settings</span>
                        </NuxtLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    </Sidebar>
</template>

<style scoped></style>
