<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useRouter} from "#app";
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
import {cn} from "@/lib/utils";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {isValidEmail} from "@/lib/validation";

const router = useRouter();
const familyStore = useFamilyStore();

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
    const email = form.value.email.trim();

    if (!email) {
        const msg = "Email is required.";
        toast.error(msg);
        error.value = null;
        return false;
    }

    if (!isValidEmail(email)) {
        const msg = "Please enter a valid email address.";
        toast.error(msg);
        error.value = null;
        return false;
    }

    form.value.email = email;
    return true;
}

const form = ref({email: ""});

async function submit() {
    error.value = null;
    success.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await familyStore.inviteMember(form.value.email);
        invitedCount.value += 1;
        form.value.email = "";
    } catch (err: any) {
        const msg = err?.data?.message ?? err?.message ?? "Failed to send invite";
        toast.error(msg);
        error.value = null;
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
    <div :class="cn('flex w-full grow flex-col justify-center self-center px-4', 'max-w-3xl')">
        <Card innerClass="p-3">
            <Stepper :class="cn('flex w-max justify-center gap-6 md:items-center', 'flex-col md:flex-row')">
                <template v-for="(s, i) in steps" :key="i">
                    <StepperItem
                        :data-state="i === active ? 'active' : i < active ? 'completed' : 'inactive'"
                        :step="i"
                        class="flex">
                        <StepperTrigger class="px-3 py-2" @click="() => (active = i)">
                            <div class="flex items-center gap-3">
                                <StepperIndicator>
                                    <span class="inline-flex h-8 w-8 items-center justify-center">{{ i + 1 }}</span>
                                </StepperIndicator>
                                <div class="text-left">
                                    <StepperTitle>{{ s.title }}</StepperTitle>
                                    <StepperDescription>{{ s.description }}</StepperDescription>
                                </div>
                            </div>
                        </StepperTrigger>
                    </StepperItem>
                </template>
            </Stepper>
        </Card>

        <Card :class="cn('w-full self-center', 'max-w-md')" :innerClass="cn('p-6')">
            <header class="text-center">
                <h1 class="text-2xl font-semibold">Invite members</h1>
            </header>

            <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
                <FormItem>
                    <FormField name="email">
                        <FormLabel for="email">Member email</FormLabel>
                        <FormControl>
                            <Input
                                id="email"
                                v-model="form.email"
                                autofocus
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
                    <Button :as="'button'" type="button" variant="outline" @click.prevent="skip">{{
                        invitedCount > 0 ? "Continue" : "Skip"
                    }}</Button>
                </div>
            </form>
        </Card>
    </div>
</template>
