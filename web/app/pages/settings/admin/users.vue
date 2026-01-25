<script setup lang="ts">
import {useUserStore} from "~/stores/user.store";
import {watch} from "vue";
const userStore = useUserStore();

const {
    data: adminUsers,
    pending: loading,
    error,
    execute: fetchAdminUsers,
} = useLazyAsyncData("adminUsers", () => userStore.listAdminUsers(), {
    server: false,
});

watch(
    () => userStore.token,
    (t) => {
        if (t) fetchAdminUsers();
    },
    {immediate: true},
);
</script>

<template>
    <div>
        <h2>Users</h2>
        <div v-if="loading">Loading...</div>
        <table v-else>
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="u in userStore.adminUsers" :key="u.id">
                    <td>{{ u.username }}</td>
                    <td>{{ u.email }}</td>
                    <td>
                        <button
                            @click="
                                () => userStore.adminResetUserPassword(u.id)
                            ">
                            Reset
                        </button>
                        <button @click="() => userStore.deleteUser(u.id)">
                            Delete
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
