<template>
  <div class="page">
    <van-nav-bar title="我的" />
    <div v-if="auth.user" class="profile-header">
      <div class="avatar">{{ avatarText }}</div>
      <div class="user-info">
        <div class="name">{{ auth.user.name }}</div>
        <div class="org">{{ auth.user.orgName }}</div>
        <van-tag :type="roleTag">{{ roleLabel }}</van-tag>
      </div>
    </div>

    <van-cell-group inset style="margin-top: 12px">
      <van-cell title="消息中心" icon="chat-o" is-link @click="$router.push('/message')" />
      <van-cell title="AI 综合评价报告" icon="chart-trending-o" is-link @click="$router.push('/report')" />
      <van-cell title="历史报告" icon="clock-o" is-link @click="$router.push('/report/history')" />
    </van-cell-group>

    <van-cell-group inset style="margin-top: 12px">
      <van-cell title="修改密码" icon="lock" is-link @click="openPwdDialog" />
      <van-cell title="关于系统" icon="info-o" value="A08 数智党校" />
    </van-cell-group>

    <div style="padding: 24px 16px">
      <van-button type="danger" block round @click="onLogout">退出登录</van-button>
    </div>

    <!-- 修改密码弹窗 -->
    <van-dialog
      v-model:show="pwdDialog"
      title="修改密码"
      show-cancel-button
      :before-close="submitPwd"
    >
      <van-cell-group inset style="margin: 12px 0">
        <van-field
          v-model="pwdForm.oldPassword"
          type="password"
          label="原密码"
          placeholder="请输入原密码"
        />
        <van-field
          v-model="pwdForm.newPassword"
          type="password"
          label="新密码"
          placeholder="请输入新密码（至少 6 位）"
        />
        <van-field
          v-model="pwdForm.confirmPassword"
          type="password"
          label="确认密码"
          placeholder="请再次输入新密码"
        />
      </van-cell-group>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';

const auth = useAuthStore();
const router = useRouter();

const avatarText = computed(() => auth.user?.name?.charAt(0) ?? '');
const roleLabel = computed(() => ({
  ADMIN: '系统管理员',
  SECRETARY: '支部书记',
  MEMBER: '党员',
} as any)[auth.user?.role ?? 'MEMBER']);
const roleTag = computed(() => ({
  ADMIN: 'danger',
  SECRETARY: 'warning',
  MEMBER: 'primary',
} as any)[auth.user?.role ?? 'MEMBER']);

const pwdDialog = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const openPwdDialog = () => {
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
  pwdDialog.value = true;
};

const submitPwd = async (action: string) => {
  if (action !== 'confirm') return true;
  if (!pwdForm.oldPassword || !pwdForm.newPassword || !pwdForm.confirmPassword) {
    showToast('请填写完整');
    return false;
  }
  if (pwdForm.newPassword.length < 6) {
    showToast('新密码至少 6 位');
    return false;
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    showToast('两次输入的新密码不一致');
    return false;
  }
  try {
    await authApi.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    showToast('密码修改成功');
    return true;
  } catch {
    return false;
  }
};

const onLogout = async () => {
  try {
    await showConfirmDialog({ title: '提示', message: '确定退出登录？' });
  } catch {
    return;
  }
  await auth.logout();
  router.push('/login');
};
</script>

<style scoped>
.profile-header {
  background: linear-gradient(135deg, #c0392b 0%, #8e1a1a 100%);
  color: #fff;
  padding: 24px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 28px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-info {
  flex: 1;
}
.name {
  font-size: 18px;
  font-weight: bold;
}
.org {
  margin: 4px 0;
  opacity: 0.9;
  font-size: 13px;
}
</style>
