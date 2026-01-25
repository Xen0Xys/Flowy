<script setup lang="ts">
import {ref} from "vue";
import {toast} from "vue-sonner";
import {useRouter} from "#app";
import {useUserStore} from "@/stores/user.store";
import {cn} from "@/lib/utils";
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

const bgImage =
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80&auto=format&fit=crop";

function validate() {
    if (!form.value.username || !form.value.email || !form.value.password) {
        const msg = "All fields are required";
        if (process.client) toast.error(msg);
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
        await store.register({
            username: form.value.username,
            email: form.value.email,
            password: form.value.password,
        });
        await router.push("/");
    } catch (err: any) {
        // store.register already shows a toast for server validation; keep inline error cleared
        error.value = null;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main :class="cn('flex min-h-screen items-center justify-center p-6')">
        <div
            :class="
                cn('grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-2')
            ">
            <aside
                class="relative hidden items-center justify-center overflow-hidden rounded-lg md:flex">
                <img
                    :src="bgImage"
                    alt="register background"
                    class="absolute inset-0 h-full w-full object-cover opacity-80" />
                <div class="relative z-10 p-8 text-center text-white">
                    <h2 class="mb-2 text-3xl font-bold">Create your account</h2>
                    <p class="text-sm opacity-90">
                        Join and start organizing with your family
                    </p>
                </div>
                <div
                    class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </aside>

            <section :class="cn('bg-card rounded-lg p-8 shadow-lg')">
                <h1 class="mb-6 text-2xl font-semibold">Register</h1>

                <form novalidate @submit.prevent="submit" class="space-y-4">
                    <FormItem>
                        <FormField name="username">
                            <FormLabel for="username">Username</FormLabel>
                            <FormControl>
                                <Input
                                    id="username"
                                    v-model="form.username"
                                    required
                                    aria-label="Username" />
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
                                    type="email"
                                    aria-label="Email" />
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
                                    type="password"
                                    aria-label="Password" />
                            </FormControl>
                            <FormMessage />
                        </FormField>
                    </FormItem>

                    <div
                        v-if="error"
                        role="alert"
                        class="text-destructive text-sm">
                        {{ error }}
                    </div>

                    <div class="pt-2">
                        <Button
                            :as="'button'"
                            :disabled="loading"
                            type="submit"
                            aria-label="Register">
                            {{ loading ? "Registering..." : "Register" }}
                        </Button>
                    </div>
                </form>

                <p class="mt-4 text-sm">
                    Already have an account?
                    <NuxtLink to="/auth/login" class="text-primary underline"
                        >Login</NuxtLink
                    >
                </p>
            </section>
        </div>
    </main>
</template>
