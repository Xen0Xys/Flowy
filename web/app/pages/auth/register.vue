<script lang="ts" setup>
import {ref} from "vue";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

const router = useRouter();
const store = useUserStore();

const form = ref({username: "", email: "", password: ""});
const loading = ref(false);
const error = ref<string | null>(null);

function validate() {
    if (!form.value.username || !form.value.email || !form.value.password) {
        error.value = "All fields are required";
        return false;
    }
    return true;
}

async function submit() {
    error.value = null;
    if (!validate()) return;
    loading.value = true;
    try {
        await store.register({
            username: form.value.username,
            email: form.value.email,
            password: form.value.password,
        });
        await router.push("/");
    } catch (err: any) {
        error.value = err?.message ?? "Registration failed";
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main>
        <h1>Register</h1>

        <form novalidate @submit.prevent="submit">
            <FormItem>
                <FormField name="username">
                    <FormLabel for="username">Username</FormLabel>
                    <FormControl>
                        <Input id="username" v-model="form.username" required />
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <FormItem>
                <FormField name="email">
                    <FormLabel for="email">Email</FormLabel>
                    <FormControl>
                        <Input
                            id="email"
                            v-model="form.email"
                            required
                            type="email" />
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <FormItem>
                <FormField name="password">
                    <FormLabel for="password">Password</FormLabel>
                    <FormControl>
                        <Input
                            id="password"
                            v-model="form.password"
                            required
                            type="password" />
                    </FormControl>
                    <FormMessage />
                </FormField>
            </FormItem>

            <div v-if="error" role="alert">{{ error }}</div>

            <div>
                <Button :as="'button'" :disabled="loading" type="submit">{{
                    loading ? "Registering..." : "Register"
                }}</Button>
            </div>
        </form>

        <p>Already have an account? <NuxtLink to="/auth/login">Login</NuxtLink></p>
    </main>
</template>
