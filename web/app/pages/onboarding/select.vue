<script lang="ts" setup>
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {
    Stepper,
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";
import {cn} from "@/lib/utils";

const router = useRouter();
const store = useUserStore();
const {apiFetch} = useApi();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

const steps = [
    {title: "Welcome", description: "Get started with Flowy"},
    {title: "Create/Join", description: "Create or join a family"},
    {title: "Invite", description: "Invite members"},
];

const active = ref(1);

function goCreate() {
    return router.push("/onboarding/create-family");
}

async function joinFamily() {
    error.value = null;
    if (!code.value) {
        error.value = "Invite code is required";
        return;
    }

    loading.value = true;
    try {
        await apiFetch(`/family/join/${encodeURIComponent(code.value)}`, {
            method: "POST",
        });
        // refresh profile and go home
        try {
            await store.fetchProfile();
        } catch {
            // ignore profile refresh failures
        }
        if (process.client) toast.success("Vous avez rejoint la famille");
        // clear inline error when success is displayed via toast
        error.value = null;
        await router.push("/");
    } catch (err: any) {
        const msg =
            err?.data?.message ?? err?.message ?? "Failed to join family";
        if (process.client) toast.error(msg);
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

        <div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            <Card
                :innerClass="
                    cn('flex flex-col justify-between', 'h-auto sm:h-72', 'p-4')
                ">
                <div class="flex flex-col gap-1">
                    <h2 class="text-lg font-medium">Create</h2>
                    <p class="text-muted-foreground text-sm">
                        Create a new family to manage shared expenses and invite
                        members. The creator becomes the family admin and can
                        send invites.
                    </p>
                </div>
                <div class="flex justify-end">
                    <Button :as="'button'" @click="goCreate"
                        >Create a new family</Button
                    >
                </div>
            </Card>

            <Card
                :innerClass="
                    cn('flex flex-col justify-between', 'h-auto sm:h-72', 'p-4')
                ">
                <div class="flex flex-col gap-2">
                    <div>
                        <h2 class="text-lg font-medium">Join</h2>
                        <p class="text-muted-foreground text-sm">
                            If someone already created a family, enter the
                            invite code they sent you to join.
                        </p>
                    </div>
                    <div>
                        <Input v-model="code" placeholder="Invite code" />
                    </div>
                </div>

                <div class="flex flex-col">
                    <div class="flex items-center justify-end">
                        <Button
                            :as="'button'"
                            :disabled="loading"
                            @click="joinFamily"
                            >{{ loading ? "Joining..." : "Join" }}</Button
                        >
                    </div>

                    <div
                        v-if="error"
                        class="text-destructive text-sm"
                        role="alert">
                        {{ error }}
                    </div>
                </div>
            </Card>
        </div>
    </div>
</template>
