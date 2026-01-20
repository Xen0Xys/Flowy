<script lang="ts" setup>
import { ref } from "vue";
import { useRouter } from "#app";
import { useUserStore } from "@/stores/user.store";
import { useApi } from "@/composables/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

const router = useRouter();
const store = useUserStore();
const { apiFetch } = useApi();

const form = ref({ name: "", currency: "EUR" });
const loading = ref(false);
const error = ref<string | null>(null);

function goBack() {
    router.push("/onboarding/select");
}

function validate() {
    if (!form.value.name) {
        error.value = "Family name is required";
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
        await router.push("/onboarding/invite");
    } catch (err: any) {
        error.value = err?.data?.message ?? err?.message ?? "Failed to create family";
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main>
        <h1>Create family</h1>

        <form novalidate @submit.prevent="submit">
            <FormItem>
                <FormField name="name">
                    <FormLabel for="name">Family name</FormLabel>
                    <FormControl>
                        <Input id="name" v-model="form.name" required />
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <FormItem>
                <FormField name="currency">
                    <FormLabel for="currency">Currency</FormLabel>
                    <FormControl>
                        <select id="currency" v-model="form.currency" class="w-full rounded-md border px-3 py-2">
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                            <option value="CHF">CHF</option>
                        </select>
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <div v-if="error" role="alert">{{ error }}</div>

            <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                <Button :as="'button'" :disabled="loading" type="submit">{{ loading ? 'Creating...' : 'Create' }}</Button>
                <Button :as="'button'" variant="outline" @click="goBack">Retour</Button>
            </div>
        </form>
    </main>
</template>
