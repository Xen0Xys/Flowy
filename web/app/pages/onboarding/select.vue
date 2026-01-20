<script lang="ts" setup>
import {ref} from "vue";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";

const router = useRouter();
const store = useUserStore();
const {apiFetch} = useApi();
const code = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

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
        await router.push("/");
    } catch (err: any) {
        error.value =
            err?.data?.message ?? err?.message ?? "Failed to join family";
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main>
        <h1>Onboarding — Select Family</h1>
        <p>Please create a new family or join an existing one to continue.</p>

        <div
            style="
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                margin-top: 1rem;
            ">
            <Card>
                <h2>Create</h2>
                <p>
                    Create a new family to manage shared expenses and invite
                    members. The creator becomes the family admin and can send
                    invites.
                </p>
                <div>
                    <Button :as="'button'" @click="goCreate"
                        >Create a new family</Button
                    >
                </div>
            </Card>

            <Card>
                <h2>Join</h2>
                <p>
                    If someone already created a family, enter the invite code
                    they sent you to join. You will be added as a family member.
                </p>
                <div>
                    <Input v-model="code" placeholder="Invite code" />
                </div>
                <div style="margin-top: 0.5rem">
                    <Button
                        :as="'button'"
                        :disabled="loading"
                        @click="joinFamily"
                        >{{ loading ? "Joining..." : "Join" }}</Button
                    >
                </div>
                <div v-if="error" role="alert">{{ error }}</div>
            </Card>
        </div>
    </main>
</template>
