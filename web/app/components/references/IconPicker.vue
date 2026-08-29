<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

const props = defineProps<{
    modelValue: string;
    triggerClass?: string;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
}>();

const {t} = useI18n();

type IconEntry = {icon: string; keywords: string};

const ICON_LIBRARY: IconEntry[] = [
    {icon: "iconoir:label", keywords: "label tag etiquette general"},
    {icon: "iconoir:bookmark", keywords: "bookmark marque-page favori"},
    {icon: "iconoir:star", keywords: "star etoile favori"},
    {icon: "iconoir:heart", keywords: "heart coeur amour love"},
    {icon: "iconoir:folder", keywords: "folder dossier"},
    {icon: "iconoir:calendar", keywords: "calendar calendrier date"},
    {icon: "iconoir:bell", keywords: "bell cloche notification"},
    {icon: "iconoir:mail", keywords: "mail email courrier"},
    {icon: "iconoir:key", keywords: "key cle acces password"},
    {icon: "iconoir:gift", keywords: "gift cadeau present"},
    {icon: "iconoir:home", keywords: "home maison logement house"},
    {icon: "iconoir:home-simple", keywords: "home maison logement house"},
    {icon: "iconoir:sofa", keywords: "sofa canape meuble furniture salon"},
    {icon: "iconoir:bed", keywords: "bed lit chambre bedroom"},
    {icon: "iconoir:light-bulb", keywords: "light bulb ampoule electricite energie idea"},
    {icon: "iconoir:washing-machine", keywords: "washing machine lave-linge menage laundry"},
    {icon: "iconoir:fridge", keywords: "fridge refrigerateur frigo cuisine"},
    {icon: "iconoir:home-shield", keywords: "home shield assurance habitation insurance"},
    {icon: "iconoir:cart", keywords: "cart caddie courses shopping panier"},
    {icon: "iconoir:shopping-bag", keywords: "shopping bag sac achats emplettes"},
    {icon: "iconoir:coffee-cup", keywords: "coffee cafe boisson drink the tea"},
    {icon: "iconoir:cutlery", keywords: "cutlery couverts fork knife restaurant repas manger meal"},
    {icon: "iconoir:apple", keywords: "apple pomme fruit fruits"},
    {icon: "iconoir:pizza-slice", keywords: "pizza part slice fast food"},
    {icon: "iconoir:glass-half", keywords: "glass verre vin wine boisson alcool drink"},
    {icon: "iconoir:ice-cream", keywords: "ice cream glace dessert sweet"},
    {icon: "iconoir:bread-slice", keywords: "bread pain boulangerie bakery"},
    {icon: "iconoir:birthday-cake", keywords: "birthday cake gateau anniversaire fete party"},
    {icon: "iconoir:chocolate", keywords: "chocolate chocolat dessert sucre"},
    {icon: "iconoir:car", keywords: "car voiture auto vehicule transport"},
    {icon: "iconoir:bus", keywords: "bus transport commun"},
    {icon: "iconoir:train", keywords: "train transport sncf metro"},
    {icon: "iconoir:tram", keywords: "tram tramway transport"},
    {icon: "iconoir:airplane", keywords: "airplane avion plane vol vacances voyage"},
    {icon: "iconoir:bicycle", keywords: "bicycle bike velo cycle"},
    {icon: "iconoir:motorcycle", keywords: "motorcycle moto scooter"},
    {icon: "iconoir:walking", keywords: "walking marche pied piedestre"},
    {icon: "iconoir:delivery-truck", keywords: "delivery truck camion livraison shipping"},
    {icon: "iconoir:gas", keywords: "gas essence carburant fuel station"},
    {icon: "iconoir:parking", keywords: "parking stationnement voiture"},
    {icon: "iconoir:package", keywords: "package colis courrier livraison"},
    {icon: "iconoir:tv", keywords: "tv television streaming ecran"},
    {icon: "iconoir:gamepad", keywords: "gamepad jeu game gaming manette videogame"},
    {icon: "iconoir:music-note", keywords: "music musique note son audio"},
    {icon: "iconoir:movie", keywords: "movie film cinema"},
    {icon: "iconoir:book", keywords: "book livre lecture reading"},
    {icon: "iconoir:headset", keywords: "headset casque audio ecouteurs"},
    {icon: "iconoir:trophy", keywords: "trophy trophee coupe recompense competition"},
    {icon: "iconoir:palette", keywords: "palette peinture art creativity artiste"},
    {icon: "iconoir:apple-mac", keywords: "apple mac ordinateur computer tech"},
    {icon: "iconoir:laptop", keywords: "laptop ordinateur pc computer portable"},
    {icon: "iconoir:computer", keywords: "computer ordinateur pc desktop"},
    {icon: "iconoir:smartphone-device", keywords: "smartphone phone telephone mobile"},
    {icon: "iconoir:printer", keywords: "printer imprimante bureau office"},
    {icon: "iconoir:shirt", keywords: "shirt vetement clothes habits chemise"},
    {icon: "iconoir:hat", keywords: "hat chapeau vetement accessoire"},
    {icon: "iconoir:umbrella", keywords: "umbrella parapluie pluie rain"},
    {icon: "iconoir:gym", keywords: "gym sport fitness musculation"},
    {icon: "iconoir:running", keywords: "running course marathon jogging sport"},
    {icon: "iconoir:swimming", keywords: "swimming natation piscine sport"},
    {icon: "iconoir:cycling", keywords: "cycling cyclisme velo sport"},
    {icon: "iconoir:healthcare", keywords: "healthcare medecin sante medical hopital doctor pill medicament"},
    {icon: "iconoir:health-shield", keywords: "health shield mutuelle assurance sante insurance"},
    {icon: "iconoir:bank", keywords: "bank banque finance compte"},
    {icon: "iconoir:wallet", keywords: "wallet portefeuille argent money"},
    {icon: "iconoir:coins", keywords: "coins pieces monnaie money"},
    {icon: "iconoir:credit-card", keywords: "credit card carte bancaire cb bleue"},
    {icon: "iconoir:piggy-bank", keywords: "piggy bank tirelire epargne savings"},
    {icon: "iconoir:cash", keywords: "cash liquide billet money argent"},
    {icon: "iconoir:euro", keywords: "euro devise currency argent"},
    {icon: "iconoir:sun-light", keywords: "sun soleil energie chauffage lumiere"},
    {icon: "iconoir:tree", keywords: "tree arbre nature jardin garden"},
    {icon: "iconoir:leaf", keywords: "leaf feuille nature ecologie eco"},
    {icon: "iconoir:user", keywords: "user personne people utilisateur"},
    {icon: "iconoir:group", keywords: "group groupe personnes famille family"},
    {icon: "iconoir:community", keywords: "community communaute personnes association"},
    {icon: "iconoir:graduation-cap", keywords: "graduation cap education ecole school etudes diplome"},
    {icon: "iconoir:presentation", keywords: "presentation travail work business bureau meeting reunion"},
    {icon: "iconoir:tools", keywords: "tools outils bricolage travaux repair"},
];

const isOpen = ref(false);
const searchQuery = ref("");
const customSlug = ref("");

const filteredIcons = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return ICON_LIBRARY;
    return ICON_LIBRARY.filter((entry) => entry.keywords.includes(q) || entry.icon.includes(q));
});

function selectIcon(icon: string) {
    emit("update:modelValue", icon);
    isOpen.value = false;
}

function applyCustom() {
    const trimmed = customSlug.value.trim();
    if (!trimmed) return;
    emit("update:modelValue", trimmed);
    isOpen.value = false;
}

watch(isOpen, (open) => {
    if (open) {
        searchQuery.value = "";
        customSlug.value = "";
    }
});
</script>

<template>
    <Popover v-model:open="isOpen">
        <PopoverTrigger as-child>
            <button
                type="button"
                :class="
                    cn(
                        'border-input bg-background hover:bg-muted focus-visible:ring-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        props.triggerClass,
                    )
                "
                :aria-label="t('settings.references.iconPicker.trigger')">
                <Icon :name="modelValue" class="h-5 w-5" />
            </button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-80 gap-3 p-3">
            <div class="flex flex-col gap-2">
                <Input
                    v-model="searchQuery"
                    class="h-8"
                    autofocus
                    :placeholder="t('settings.references.iconPicker.search')" />
                <div v-if="filteredIcons.length" class="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto pr-1">
                    <button
                        v-for="entry in filteredIcons"
                        :key="entry.icon"
                        type="button"
                        class="hover:bg-muted focus-visible:ring-ring flex h-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        :class="{
                            'bg-primary text-primary-foreground hover:bg-primary': modelValue === entry.icon,
                        }"
                        :aria-label="entry.icon"
                        :title="entry.icon"
                        @click="selectIcon(entry.icon)">
                        <Icon :name="entry.icon" class="h-4 w-4" />
                    </button>
                </div>
                <div v-else class="text-muted-foreground py-8 text-center text-xs">
                    {{ t("settings.references.iconPicker.empty") }}
                </div>
            </div>
            <div class="border-border/60 flex flex-col gap-1.5 border-t pt-3">
                <div class="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                    {{ t("settings.references.iconPicker.customLabel") }}
                </div>
                <div class="flex items-center gap-2">
                    <Input v-model="customSlug" class="h-8 text-xs" placeholder="iconoir:label" />
                    <Button size="sm" type="button" :disabled="!customSlug.trim()" @click="applyCustom">
                        {{ t("settings.references.iconPicker.apply") }}
                    </Button>
                </div>
                <div class="text-muted-foreground text-[10px]">
                    {{ t("settings.references.findIconsAt") }}
                    <a
                        class="hover:text-foreground underline"
                        href="https://icones.js.org/collection/iconoir"
                        target="_blank"
                        rel="noopener noreferrer">
                        {{ t("settings.references.iconLibrary") }}
                    </a>
                </div>
            </div>
        </PopoverContent>
    </Popover>
</template>
