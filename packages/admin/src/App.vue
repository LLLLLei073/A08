<template>
  <el-config-provider :locale="zhCn">
    <router-view />
    <ForceSetPasswordDialog v-model="showDialog" />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useAuthStore } from '@/store/auth';
import ForceSetPasswordDialog from '@/components/ForceSetPasswordDialog.vue';

const auth = useAuthStore();
const showDialog = computed({
  get: () => auth.isLoggedIn && auth.forceChangePassword,
  set: (val) => { if (!val) auth.forceChangePassword = false },
});

// 登录态恢复后（如硬刷新），若服务端仍标记需要改密，则继续弹出
watch(() => auth.user, (user) => {
  if (user && auth.forceChangePassword) {
    // 弹窗已自动显示
  }
}, { immediate: true });
</script>
