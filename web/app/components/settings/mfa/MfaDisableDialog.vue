<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {PinInput, PinInputGroup, PinInputSeparator, PinInputSlot} from "@/components/ui/pin-input";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {PasskeyCancelledError, useMfa} from "@/composables/useMfa";

type Props = {
    open: boolean;
    scope?: "all" | "totp";
};

const props = withDefaults(defineProps<Props>(), {scope: "all"});
const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "disabled"): void;
}>();

const {t} = useI18n();
const {disableMfa, disableTotp, getMfaFactors, getPasskeySettingsAssertion} = useMfa();

type Mode = "totp" | "backup" | "passkey";

const mode = ref<Mode>("totp");

const dialogTitle = computed(() =>
    props.scope === "totp" ? t("profile.mfa.removeTotp.title") : t("profile.mfa.disable.title"),
);
const dialogDescription = computed(() =>
    props.scope === "totp" ? t("profile.mfa.removeTotp.description") : t("profile.mfa.disable.description"),
);
const submitLabel = computed(() => {
    if (mode.value === "passkey") return t("profile.mfa.disable.passkeyAction");
    return props.scope === "totp" ? t("profile.mfa.removeTotp.action") : t("profile.mfa.disable.action");
});
const password = ref("");
const showPassword = ref(false);
const totpDigits = ref<string[]>([]);
const backupCode = ref("");
const loading = ref(false);
const hasPasskey = ref(false);

const totpCode = computed(() => totpDigits.value.join(""));
const normalizedBackup = computed(() => backupCode.value.replace(/[\s-]+/g, "").toUpperCase());
// Per-factor removal (Q3): removing TOTP must be authorised by a TOTP code;
// passkey/backup are only accepted for the full-disable flow.
const isTotpScope = computed(() => props.scope === "totp");
const showPasskeyTab = computed(() => !isTotpScope.value && hasPasskey.value);
const showBackupTab = computed(() => !isTotpScope.value);
const canSubmit = computed(() => {
    if (!password.value.trim()) return false;
    if (mode.value === "totp") return totpCode.value.length === 6;
    if (mode.value === "backup") return normalizedBackup.value.length === 8;
    return true;
});

async function refreshFactors() {
    try {
        const factors = await getMfaFactors();
        hasPasskey.value = factors.passkeyCount > 0;
        if (isTotpScope.value) {
            mode.value = "totp";
        } else if (hasPasskey.value) {
            mode.value = "passkey";
        } else {
            mode.value = "totp";
        }
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
    totpDigits.value = [];
    backupCode.value = "";
});

function reset() {
    mode.value = isTotpScope.value || !hasPasskey.value ? "totp" : "passkey";
    password.value = "";
    showPassword.value = false;
    totpDigits.value = [];
    backupCode.value = "";
    loading.value = false;
}

function handleUpdateOpen(next: boolean) {
    if (loading.value && !next) return;
    emit("update:open", next);
}

async function submit() {
    if (!canSubmit.value || loading.value) return;
    loading.value = true;
    try {
        if (isTotpScope.value) {
            // /auth/mfa/totp requires a TOTP code; passkey/backup are not accepted here.
            await disableTotp(password.value, totpCode.value);
        } else if (mode.value === "passkey") {
            const response = await getPasskeySettingsAssertion();
            await disableMfa(password.value, {kind: "passkey", response});
        } else {
            const code = mode.value === "totp" ? totpCode.value : normalizedBackup.value;
            await disableMfa(password.value, {kind: "code", code});
        }
        emit("disabled");
        emit("update:open", false);
    } catch (err) {
        if (err instanceof PasskeyCancelledError) {
            // Silent cancel: keep the form intact for retry.
            return;
        }
        totpDigits.value = [];
        backupCode.value = "";
    } finally {
        loading.value = false;
    }
}

function handleComplete() {
    if (password.value.trim()) void submit();
}
</script>

<template>
    <Dialog :open="open" @update:open="handleUpdateOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ dialogTitle }}</DialogTitle>
                <DialogDescription>{{ dialogDescription }}</DialogDescription>
            </DialogHeader>
            <form class="space-y-4" @submit.prevent="submit">
                <div class="space-y-2">
                    <Label for="mfa-disable-password">{{ t("common.confirmPassword") }}</Label>
                    <div class="relative">
                        <Input
                            id="mfa-disable-password"
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

                <Tabs v-if="showPasskeyTab || showBackupTab" v-model="mode" class="w-full">
                    <TabsList
                        :class="showPasskeyTab && showBackupTab ? 'grid w-full grid-cols-3' : 'grid w-full grid-cols-2'">
                        <TabsTrigger v-if="showPasskeyTab" value="passkey">
                            {{ t("profile.mfa.disable.tabPasskey") }}
                        </TabsTrigger>
                        <TabsTrigger value="totp">{{ t("profile.mfa.disable.tabTotp") }}</TabsTrigger>
                        <TabsTrigger v-if="showBackupTab" value="backup">
                            {{ t("profile.mfa.disable.tabBackup") }}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent v-if="showPasskeyTab" class="space-y-2 pt-3" value="passkey">
                        <p class="text-muted-foreground text-sm">
                            {{ t("profile.mfa.disable.passkeyDescription") }}
                        </p>
                    </TabsContent>
                    <TabsContent class="space-y-2 pt-3" value="totp">
                        <Label for="mfa-disable-totp">{{ t("profile.mfa.disable.codeLabel") }}</Label>
                        <div class="flex justify-center">
                            <PinInput
                                id="mfa-disable-totp"
                                v-model="totpDigits"
                                :disabled="loading"
                                :otp="true"
                                type="text"
                                @complete="handleComplete">
                                <PinInputGroup>
                                    <PinInputSlot
                                        v-for="index in 3"
                                        :key="`disable-start-${index}`"
                                        :index="index - 1" />
                                </PinInputGroup>
                                <PinInputSeparator />
                                <PinInputGroup>
                                    <PinInputSlot v-for="index in 3" :key="`disable-end-${index}`" :index="index + 2" />
                                </PinInputGroup>
                            </PinInput>
                        </div>
                    </TabsContent>
                    <TabsContent v-if="showBackupTab" class="space-y-2 pt-3" value="backup">
                        <Label for="mfa-disable-backup">{{ t("profile.mfa.disable.backupCodeLabel") }}</Label>
                        <Input
                            id="mfa-disable-backup"
                            v-model="backupCode"
                            :disabled="loading"
                            :placeholder="t('profile.mfa.disable.backupCodePlaceholder')"
                            autocomplete="off"
                            class="text-center font-mono tracking-widest uppercase"
                            inputmode="text"
                            type="text" />
                    </TabsContent>
                </Tabs>

                <div v-else class="space-y-2">
                    <Label for="mfa-disable-totp-only">{{ t("profile.mfa.disable.codeLabel") }}</Label>
                    <div class="flex justify-center">
                        <PinInput
                            id="mfa-disable-totp-only"
                            v-model="totpDigits"
                            :disabled="loading"
                            :otp="true"
                            type="text"
                            @complete="handleComplete">
                            <PinInputGroup>
                                <PinInputSlot
                                    v-for="index in 3"
                                    :key="`disable-only-start-${index}`"
                                    :index="index - 1" />
                            </PinInputGroup>
                            <PinInputSeparator />
                            <PinInputGroup>
                                <PinInputSlot v-for="index in 3" :key="`disable-only-end-${index}`" :index="index + 2" />
                            </PinInputGroup>
                        </PinInput>
                    </div>
                </div>
            </form>
            <DialogFooter>
                <Button :disabled="loading" type="button" variant="ghost" @click="emit('update:open', false)">
                    {{ t("common.cancel") }}
                </Button>
                <Button :disabled="loading || !canSubmit" type="button" variant="destructive" @click="submit">
                    <Icon v-if="loading" class="mr-1 size-4 animate-spin" name="iconoir:refresh" />
                    {{ submitLabel }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
