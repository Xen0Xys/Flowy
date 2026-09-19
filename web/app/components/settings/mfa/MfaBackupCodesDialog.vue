<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {PasskeyCancelledError, useMfa} from "@/composables/useMfa";
import MfaBackupCodesDisplay from "./MfaBackupCodesDisplay.vue";

type Props = {
    open: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
}>();

const {t} = useI18n();
const {regenerateBackupCodes, getMfaFactors, getPasskeySettingsAssertion} = useMfa();

type Step = "form" | "display";
type Mode = "totp" | "passkey";
const step = ref<Step>("form");
const mode = ref<Mode>("totp");
const password = ref("");
const showPassword = ref(false);
const code = ref("");
const loading = ref(false);
const codes = ref<string[]>([]);
const hasPasskey = ref(false);
const codesSaved = ref(false);

const canSubmit = computed(() => {
    if (!password.value.trim()) return false;
    if (mode.value === "totp") return code.value.trim().length > 0;
    return true;
});

async function refreshFactors() {
    try {
        const factors = await getMfaFactors();
        hasPasskey.value = factors.passkeyCount > 0;
        if (hasPasskey.value) mode.value = "passkey";
    } catch {
        hasPasskey.value = false;
    }
}

watch(
    () => props.open,
    (value) => {
        if (value) {
            void refreshFactors();
        } else {
            reset();
        }
    },
);

watch(mode, () => {
    code.value = "";
});

function reset() {
    step.value = "form";
    mode.value = hasPasskey.value ? "passkey" : "totp";
    password.value = "";
    showPassword.value = false;
    code.value = "";
    loading.value = false;
    codes.value = [];
    codesSaved.value = false;
}

async function submit() {
    if (!canSubmit.value || loading.value) return;
    loading.value = true;
    try {
        const generated =
            mode.value === "passkey"
                ? await regenerateBackupCodes(password.value, {
                      kind: "passkey",
                      response: await getPasskeySettingsAssertion(),
                  })
                : await regenerateBackupCodes(password.value, {kind: "code", code: code.value.trim()});
        codes.value = generated;
        step.value = "display";
    } catch (err) {
        if (err instanceof PasskeyCancelledError) return;
        code.value = "";
    } finally {
        loading.value = false;
    }
}

function handleUpdateOpen(next: boolean) {
    if (loading.value && !next) return;
    // Block accidental dismissal while codes are visible and not acknowledged.
    if (!next && step.value === "display" && !codesSaved.value) return;
    emit("update:open", next);
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ t("profile.mfa.regenerate.title") }}</DialogTitle>
                <DialogDescription>
                    {{
                        step === "form"
                            ? t("profile.mfa.regenerate.description")
                            : t("profile.mfa.backupCodes.warningBody")
                    }}
                </DialogDescription>
            </DialogHeader>

            <form v-if="step === 'form'" class="space-y-3" @submit.prevent="submit">
                <div class="space-y-2">
                    <Label for="mfa-regen-password">{{ t("common.confirmPassword") }}</Label>
                    <div class="relative">
                        <Input
                            id="mfa-regen-password"
                            v-model="password"
                            :disabled="loading"
                            :placeholder="t('common.currentPasswordPlaceholder')"
                            :type="showPassword ? 'text' : 'password'"
                            autocomplete="current-password"
                            class="pr-10" />
                        <Button
                            :aria-label="showPassword ? t('common.hidePassword') : t('common.showPassword')"
                            class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                            size="icon"
                            type="button"
                            variant="ghost"
                            @click="showPassword = !showPassword">
                            <Icon :name="showPassword ? 'iconoir:eye-closed' : 'iconoir:eye'" class="size-4" />
                        </Button>
                    </div>
                </div>

                <Tabs v-if="hasPasskey" v-model="mode" class="w-full">
                    <TabsList class="grid w-full grid-cols-2">
                        <TabsTrigger value="passkey">{{ t("profile.mfa.regenerate.tabPasskey") }}</TabsTrigger>
                        <TabsTrigger value="totp">{{ t("profile.mfa.regenerate.tabTotp") }}</TabsTrigger>
                    </TabsList>
                    <TabsContent class="space-y-2 pt-3" value="passkey">
                        <p class="text-muted-foreground text-sm">
                            {{ t("profile.mfa.regenerate.passkeyDescription") }}
                        </p>
                    </TabsContent>
                    <TabsContent class="space-y-2 pt-3" value="totp">
                        <Label for="mfa-regen-code-tab">{{ t("profile.mfa.regenerate.codeLabel") }}</Label>
                        <Input
                            id="mfa-regen-code-tab"
                            v-model="code"
                            :disabled="loading"
                            autocomplete="one-time-code"
                            inputmode="numeric"
                            maxlength="6"
                            placeholder="123456"
                            type="text" />
                    </TabsContent>
                </Tabs>
                <div v-else class="space-y-2">
                    <Label for="mfa-regen-code-only">{{ t("profile.mfa.regenerate.codeLabel") }}</Label>
                    <Input
                        id="mfa-regen-code-only"
                        v-model="code"
                        :disabled="loading"
                        autocomplete="one-time-code"
                        inputmode="numeric"
                        maxlength="6"
                        placeholder="123456"
                        type="text" />
                </div>
            </form>

            <div v-else class="space-y-3">
                <MfaBackupCodesDisplay :codes="codes" />
                <div class="flex items-center gap-2 text-sm">
                    <Switch id="backup-codes-saved" v-model="codesSaved" />
                    <Label for="backup-codes-saved">{{ t("profile.mfa.backupCodes.saveConfirm") }}</Label>
                </div>
            </div>

            <DialogFooter>
                <template v-if="step === 'form'">
                    <Button :disabled="loading" type="button" variant="ghost" @click="emit('update:open', false)">
                        {{ t("common.cancel") }}
                    </Button>
                    <Button :disabled="loading || !canSubmit" type="button" @click="submit">
                        <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                        {{
                            mode === "passkey"
                                ? t("profile.mfa.regenerate.passkeyAction")
                                : t("profile.mfa.regenerate.action")
                        }}
                    </Button>
                </template>
                <template v-else>
                    <Button :disabled="!codesSaved" type="button" @click="emit('update:open', false)">
                        {{ t("profile.mfa.backupCodes.done") }}
                    </Button>
                </template>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
