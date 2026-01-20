<script lang="ts" setup>
import {ref} from "vue";
import {useRouter} from "#app";
import {useApi} from "@/composables/useApi";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

const router = useRouter();
const {apiFetch} = useApi();

const email = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const invitedCount = ref(0);

function validate() {
    if (!email.value) {
        error.value = "Email is required";
        return false;
    }
    return true;
}

async function sendInvite() {
    error.value = null;
    success.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        const data = await apiFetch("/family/invite", {
            method: "POST",
            body: {email: email.value},
        });
        success.value = `Invite sent to ${email.value}`;
        invitedCount.value += 1;
        email.value = "";
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
    <main>
        <h1>Invite members</h1>

        <p>
            Invite members by email. They will receive a code to join your
            family.
        </p>

        <div>
            <Input v-model="email" placeholder="member@example.com" />
        </div>

        <div
            style="
                margin-top: 0.5rem;
                display: flex;
                gap: 0.5rem;
                align-items: center;
            ">
            <Button :as="'button'" :disabled="loading" @click="sendInvite">{{
                loading ? "Sending..." : "Send invite"
            }}</Button>
            <Button :as="'button'" variant="outline" @click="skip">{{
                invitedCount > 0 ? "Continue" : "Skip"
            }}</Button>
        </div>

        <div v-if="error" role="alert">{{ error }}</div>
        <div v-if="success" role="status">{{ success }}</div>
    </main>
</template>
