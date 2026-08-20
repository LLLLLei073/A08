<template>
  <router-view />
  <ForceSetPasswordDialog v-model="showDialog" />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAuthStore } from '@/store/auth';
import ForceSetPasswordDialog from '@/components/ForceSetPasswordDialog.vue';

const auth = useAuthStore();
const showDialog = computed({
  get: () => auth.isLoggedIn && auth.forceChangePassword,
  set: (val) => {
    if (!val) auth.forceChangePassword = false;
  },
});

watch(() => auth.user, (user) => {
  if (user && auth.forceChangePassword) {
    // 弹窗已自动显示
  }
}, { immediate: true });
</script>
