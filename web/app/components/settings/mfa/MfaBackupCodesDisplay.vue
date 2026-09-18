<script lang="ts" setup>
import {ref} from "vue";
import {useI18n} from "vue-i18n";
import {toast} from "vue-sonner";
import {Button} from "@/components/ui/button";

type Props = {
    codes: string[];
};

const props = defineProps<Props>();
const {t} = useI18n();

const copied = ref(false);

async function copy() {
    try {
        await navigator.clipboard.writeText(props.codes.join("\n"));
        copied.value = true;
        toast.success(t("profile.mfa.backupCodes.copied"));
        setTimeout(() => (copied.value = false), 2000);
    } catch {
        toast.error(t("profile.mfa.backupCodes.copyFailed"));
    }
}

function download() {
    const blob = new Blob([props.codes.join("\n")], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flowy-backup-codes.txt";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
</script>

<template>
    <div class="space-y-3">
        <div class="bg-muted grid grid-cols-2 gap-2 rounded-md p-4 font-mono text-sm">
            <span v-for="c in codes" :key="c" class="tabular-nums">{{ c }}</span>
        </div>
        <div class="flex gap-2">
            <Button size="sm" type="button" variant="outline" @click="copy">
                <Icon :name="copied ? 'iconoir:check' : 'iconoir:copy'" class="mr-1 size-4" />
                {{ copied ? t("profile.mfa.backupCodes.copiedShort") : t("profile.mfa.backupCodes.copy") }}
            </Button>
            <Button size="sm" type="button" variant="outline" @click="download">
                <Icon class="mr-1 size-4" name="iconoir:download" />
                {{ t("profile.mfa.backupCodes.download") }}
            </Button>
        </div>
    </div>
</template>
