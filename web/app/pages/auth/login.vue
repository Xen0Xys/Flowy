<script setup lang="ts">
import {ref} from "vue";
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

const form = ref({email: "", password: ""});
const loading = ref(false);
const error = ref<string | null>(null);

const bgImage =
  "https://images.unsplash.com/photo-1508780709619-79562169bc64?w=1600&q=80&auto=format&fit=crop";

function validate() {
  if (!form.value.email || !form.value.password) {
    error.value = "Email and password are required";
    return false;
  }
  return true;
}

async function submit() {
  error.value = null;
  if (!validate()) return;
  loading.value = true;
  try {
    await store.login({
      email: form.value.email,
      password: form.value.password,
    });
    // redirect after successful login
    await router.push("/");
  } catch (err: any) {
    error.value = err?.message ?? "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
    <main :class="cn('min-h-screen flex items-center justify-center p-6')">
        <div :class="cn('w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8')">
            <aside class="relative hidden md:flex items-center justify-center rounded-lg overflow-hidden">
                <img
                    :src="bgImage"
                    alt="login background"
                    class="absolute inset-0 w-full h-full object-cover opacity-80"
                />
                <div class="relative z-10 p-8 text-center text-white">
                    <h2 class="text-3xl font-bold mb-2">Welcome back</h2>
                    <p class="text-sm opacity-90">Sign in to continue to your dashboard</p>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </aside>

            <section :class="cn('bg-card rounded-lg p-8 shadow-lg')">
                <h1 class="text-2xl font-semibold mb-6">Login</h1>

                <form novalidate @submit.prevent="submit" class="space-y-4">
                    <FormItem>
                        <FormField name="email">
                            <FormLabel for="email">Email</FormLabel>
                            <FormControl>
                                <Input
                                    id="email"
                                    v-model="form.email"
                                    required
                                    type="email"
                                    aria-label="Email"
                                />
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
                                    aria-label="Password"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormField>
                    </FormItem>

                    <div v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</div>

                    <div class="pt-2">
                        <Button :as="'button'" :disabled="loading" type="submit" aria-label="Login">
                            {{ loading ? "Logging in..." : "Login" }}
                        </Button>
                    </div>
                </form>

                <p class="mt-4 text-sm">
                    Don't have an account?
                    <NuxtLink to="/auth/register" class="text-primary underline">Register</NuxtLink>
                </p>
            </section>
        </div>
    </main>
</template>
