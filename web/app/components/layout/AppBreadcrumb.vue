<script lang="ts" setup>
import {useBreadcrumbs} from "~/composables/useBreadcrumbs";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";

const {breadcrumbs} = useBreadcrumbs();
</script>

<template>
    <Breadcrumb v-if="breadcrumbs.length > 0">
        <BreadcrumbList class="text-xs sm:text-sm">
            <template v-for="(item, index) in breadcrumbs" :key="item.href ?? item.label">
                <BreadcrumbItem>
                    <BreadcrumbLink
                        v-if="item.href && index < breadcrumbs.length - 1"
                        :href="item.href"
                        class="flex items-center gap-1.5">
                        <Icon v-if="item.icon" class="text-primary h-3.5 w-3.5 shrink-0" :name="item.icon" />
                        {{ item.label }}
                    </BreadcrumbLink>
                    <BreadcrumbPage v-else class="flex items-center gap-1.5">
                        <Icon v-if="item.icon" class="text-primary h-3.5 w-3.5 shrink-0" :name="item.icon" />
                        {{ item.label }}
                    </BreadcrumbPage>
                </BreadcrumbItem>
                <BreadcrumbSeparator v-if="index < breadcrumbs.length - 1" class="text-muted-foreground/70" />
            </template>
        </BreadcrumbList>
    </Breadcrumb>
</template>
