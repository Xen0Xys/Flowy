<script lang="ts" setup>
import {computed} from "vue";
import {ChevronsUpDown, Plus} from "lucide-vue-next";
import {Icon} from "#components";
import {Button} from "~/components/ui/button";
import {
    Combobox,
    ComboboxAnchor,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxSeparator,
    ComboboxTrigger,
    ComboboxViewport,
} from "~/components/ui/combobox";

type Item = {id: string; name: string; icon?: string; hexColor?: string};

const props = withDefaults(
    defineProps<{
        modelValue: string;
        items: Item[];
        placeholder: string;
        emptyText: string;
        noneLabel: string;
        createLabel: string;
        disabled?: boolean;
        id?: string;
    }>(),
    {disabled: false},
);

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "create"): void;
}>();

const selectedItem = computed(() => {
    if (!props.modelValue || props.modelValue === "none") return null;
    return props.items.find((i) => i.id === props.modelValue) ?? null;
});

const onValueChange = (value: string | number | boolean | Array<string | number | boolean>) => {
    const next = String(value);
    if (next === "__create__") {
        emit("create");
        return;
    }
    emit("update:modelValue", next);
};

const displayValue = (value: string | number | boolean | Array<string | number | boolean>): string => {
    const v = String(value);
    if (!v || v === "none" || v === "__create__") return "";
    const item = props.items.find((i) => i.id === v);
    return item?.name ?? "";
};
</script>

<template>
    <Combobox :model-value="modelValue" :reset-search-term-on-select="true" @update:model-value="onValueChange">
        <ComboboxAnchor as-child>
            <ComboboxTrigger as-child>
                <Button
                    :id="id"
                    :disabled="disabled"
                    type="button"
                    variant="outline"
                    class="w-full justify-between font-normal">
                    <span class="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
                        <template v-if="selectedItem">
                            <Icon
                                v-if="selectedItem.icon"
                                :name="selectedItem.icon"
                                :style="selectedItem.hexColor ? {color: selectedItem.hexColor} : undefined"
                                class="h-4 w-4 shrink-0" />
                            <span class="truncate">{{ selectedItem.name }}</span>
                        </template>
                        <span v-else class="text-muted-foreground">{{ placeholder }}</span>
                    </span>
                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </ComboboxTrigger>
        </ComboboxAnchor>
        <ComboboxList
            class="*:data-[slot=input-group]:!m-0 *:data-[slot=input-group]:!rounded-none *:data-[slot=input-group]:!border-x-0 *:data-[slot=input-group]:!border-t-0">
            <ComboboxInput
                :placeholder="placeholder"
                :display-value="displayValue"
                class="text-base !outline-none focus:!ring-0 focus:!outline-none focus-visible:!ring-0 focus-visible:!outline-none md:text-sm" />
            <ComboboxEmpty>{{ emptyText }}</ComboboxEmpty>
            <ComboboxViewport>
                <ComboboxGroup>
                    <ComboboxItem value="none">
                        <span class="text-muted-foreground">{{ noneLabel }}</span>
                    </ComboboxItem>
                    <ComboboxItem v-for="item in items" :key="item.id" :value="item.id">
                        <Icon
                            v-if="item.icon"
                            :name="item.icon"
                            :style="item.hexColor ? {color: item.hexColor} : undefined"
                            class="h-4 w-4 shrink-0" />
                        <span>{{ item.name }}</span>
                    </ComboboxItem>
                </ComboboxGroup>
                <ComboboxSeparator />
                <ComboboxGroup>
                    <ComboboxItem value="__create__">
                        <Plus class="text-primary" />
                        <span>{{ createLabel }}</span>
                    </ComboboxItem>
                </ComboboxGroup>
            </ComboboxViewport>
        </ComboboxList>
    </Combobox>
</template>
