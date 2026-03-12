<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {Card} from "@/components/ui/card";
import {cn} from "@/lib/utils";

const router = useRouter();
const store = useUserStore();
const {apiFetch} = useApi();

const form = ref({name: "", currency: "EUR"});
const loading = ref(false);
const error = ref<string | null>(null);

const steps = [
    {title: "Welcome", description: "Get started with Flowy"},
    {title: "Create/Join", description: "Create or join a family"},
    {title: "Invite", description: "Invite members"},
];

// stepper indexes the steps from 0 in the template loop, start at 0 so
// the first step is active by default
const active = ref(0);

// rely on global background token

function goBack() {
    router.push("/onboarding/select");
}

function validate() {
    if (!form.value.name) {
        const msg = "Family name is required";
        toast.error(msg);
        // remove inline error when using toast
        error.value = null;
        return false;
    }
    return true;
}

async function submit() {
    error.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        const data = await apiFetch("/family/create", {
            method: "POST",
            body: {
                name: form.value.name,
                currency: form.value.currency,
            },
        });

        // refresh profile to pick up family membership
        try {
            await store.fetchProfile();
        } catch {
            // ignore
        }

        // optionally navigate to invite page so creator can invite members
        toast.success("Family created");
        await router.push("/onboarding/invite");
    } catch (err: any) {
        const msg =
            err?.data?.message ?? err?.message ?? "Failed to create family";
        toast.error(msg);
        // ensure no inline error is left visible when using toast
        error.value = null;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div
        :class="
            cn(
                'flex w-full grow flex-col justify-center self-center px-4',
                'max-w-3xl',
            )
        ">
        <Card innerClass="p-3">
            <Stepper
                :class="
                    cn(
                        'flex w-max justify-center gap-6 md:items-center',
                        'flex-col md:flex-row',
                    )
                ">
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
                        class="flex">
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

        <Card
            :class="cn('w-full self-center', 'max-w-md')"
            :innerClass="cn('p-6')">
            <header class="text-center">
                <h1 class="text-2xl font-semibold">Create family</h1>
            </header>
            <form
                class="flex flex-col gap-4"
                novalidate
                @submit.prevent="submit">
                <FormItem>
                    <FormField name="name">
                        <FormLabel for="name">Family name</FormLabel>
                        <FormControl>
                            <Input
                                id="name"
                                v-model="form.name"
                                required
                                autofocus />
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <FormItem>
                    <FormField name="currency">
                        <FormLabel for="currency">Currency</FormLabel>
                        <FormControl>
                            <select
                                id="currency"
                                v-model="form.currency"
                                :class="
                                    cn(
                                        'w-full rounded-md border bg-transparent px-3 py-2',
                                    )
                                ">
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                                <option value="GBP">GBP</option>
                                <option value="CHF">CHF</option>
                            </select>
                        </FormControl>
                        <FormMessage />
                    </FormField>
                </FormItem>

                <div v-if="error" class="text-destructive text-sm" role="alert">
                    {{ error }}
                </div>

                <div class="flex justify-between">
                    <Button
                        :as="'button'"
                        type="button"
                        variant="destructive"
                        @click.prevent="goBack"
                        >Retour</Button
                    >
                    <Button :as="'button'" :disabled="loading" type="submit">{{
                        loading ? "Creating..." : "Create"
                    }}</Button>
                </div>
            </form>
        </Card>
    </div>
</template>
