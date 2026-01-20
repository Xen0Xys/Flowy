<script lang="ts" setup>
import {ref} from "vue";
import {useRouter} from "#app";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {Card} from "~/components/ui/card";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "~/components/ui/form";

const router = useRouter();
const {apiFetch} = useApi();

const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const invitedCount = ref(0);

const steps = [
    {title: "Welcome", description: "Get started with Flowy"},
    {title: "Create/Join", description: "Create or join a family"},
    {title: "Invite", description: "Invite members"},
];

const active = ref(2);

function validate() {
    if (!form.value.email) {
        error.value = "Email is required";
        return false;
    }
    return true;
}

const form = ref({email: ""});

async function submit() {
    error.value = null;
    success.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        const data = await apiFetch("/family/invite", {
            method: "POST",
            body: {email: form.value.email},
        });
        success.value = `Invite sent to ${form.value.email}`;
        invitedCount.value += 1;
        form.value.email = "";
    } catch (err: any) {
        error.value =
            err?.data?.message ?? err?.message ?? "Failed to send invite";
    } finally {
        loading.value = false;
    }
}

function skip() {
    // proceed to home even if no invites sent
    router.push("/");
}
</script>

<template>
    <div class="flex w-240 grow flex-col justify-center self-center">
        <Card innerClass="p-3">
            <Stepper
                class="flex w-full flex-row items-center justify-center gap-4">
                <template v-for="(s, i) in steps" :key="i">
                    <StepperItem
                        :data-state="
                            i === active
                                ? 'active'
                                : i < active
                                  ? 'completed'
                                  : 'inactive'
                        "
                        :step="i"
                        class="group inline-flex items-center">
                        <StepperTrigger
                            class="px-3 py-2"
                            @click="() => (active = i)">
                            <div class="flex items-center gap-3">
                                <StepperIndicator>
                                    <span
                                        class="inline-flex h-8 w-8 items-center justify-center"
                                        >{{ i + 1 }}</span
                                    >
                                </StepperIndicator>
                                <div class="text-left">
                                    <StepperTitle>{{ s.title }}</StepperTitle>
                                    <StepperDescription>{{
                                        s.description
                                    }}</StepperDescription>
                                </div>
                            </div>
                        </StepperTrigger>
                    </StepperItem>
                </template>
            </Stepper>
        </Card>

        <Card class="w-120 self-center" innerClass="p-6">
            <header class="text-center">
                <h1 class="text-2xl font-semibold">Invite members</h1>
            </header>

            <form
                class="flex flex-col gap-4"
                novalidate
                @submit.prevent="submit">
                <FormItem>
                    <FormField name="name">
                        <FormLabel for="name">Member email</FormLabel>
                        <FormControl>
                            <Input
                                id="name"
                                v-model="form.email"
                                placeholder="member@example.org"
                                required
                                type="email" />
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <div v-if="error" class="text-destructive text-sm" role="alert">
                    {{ error }}
                </div>

                <div class="flex items-center justify-end gap-2">
                    <Button :as="'button'" :disabled="loading" type="submit">{{
                        loading ? "Sending..." : "Send invite"
                    }}</Button>
                    <Button
                        :as="'button'"
                        variant="outline"
                        @click.prevent="skip"
                        >{{ invitedCount > 0 ? "Continue" : "Skip" }}</Button
                    >
                </div>
            </form>
        </Card>
    </div>
</template>
