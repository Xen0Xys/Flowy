<script lang="ts" setup>
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useCookie} from "#app";
import {Button} from "@/components/ui/button";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {cn} from "@/lib/utils";

const props = withDefaults(
    defineProps<{
        align?: "start" | "center" | "end";
        class?: string;
    }>(),
    {
        align: "end",
    },
);

const {t, locale, locales, setLocale} = useI18n();
const localeCookie = useCookie<string | null>("i18n_redirected");

const availableLocales = computed(() => locales.value.filter((entry) => entry.code === "en" || entry.code === "fr"));

const currentCode = computed(() => locale.value.toUpperCase());

async function select(target: string) {
    if (target !== "en" && target !== "fr") return;
    localeCookie.value = target;
    await setLocale(target);
}
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                :aria-label="t('auth.common.changeLanguage')"
                :class="cn('gap-1.5 rounded-full px-3', props.class)"
                size="sm"
                type="button"
                variant="ghost">
                <Icon class="size-4" name="iconoir:language" />
                <span class="text-xs font-semibold tracking-wide">{{ currentCode }}</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent :align="props.align" class="min-w-36">
            <DropdownMenuItem
                v-for="entry in availableLocales"
                :key="entry.code"
                :aria-checked="locale === entry.code"
                :data-active="locale === entry.code ? '' : undefined"
                role="menuitemradio"
                @select="select(entry.code)">
                <span>{{ entry.name }}</span>
                <Icon v-if="locale === entry.code" class="text-primary ml-auto size-4" name="iconoir:check" />
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
