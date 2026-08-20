<template>
  <van-dialog
    v-model:show="visible"
    title="首次登录：请修改密码"
    :close-on-click-overlay="false"
    :show-confirm-button="false"
    :show-cancel-button="false"
  >
    <div class="pwd-dialog-body">
      <p class="hint">为了您的账户安全，首次登录后请先设置一个符合强度要求的新密码。</p>

      <div class="field">
        <label>新密码</label>
        <div class="input-wrap">
          <input v-model="form.newPassword" :type="showPwd ? 'text' : 'password'" placeholder="请输入新密码" @input="onPasswordInput" />
          <van-icon :name="showPwd ? 'eye-o' : 'closed-eye'" size="18" color="#8a8276" @click="showPwd = !showPwd" />
        </div>
      </div>

      <div class="field">
        <label>确认密码</label>
        <div class="input-wrap">
          <input v-model="form.confirmPassword" :type="showPwd2 ? 'text' : 'password'" placeholder="请再次输入新密码" />
          <van-icon :name="showPwd2 ? 'eye-o' : 'closed-eye'" size="18" color="#8a8276" @click="showPwd2 = !showPwd2" />
        </div>
      </div>

      <div class="strength-panel">
        <div class="strength-row">
          <span class="label">密码强度</span>
          <div class="bar-wrap"><div class="bar" :style="{ width: strengthPercent, backgroundColor: strengthColor }"></div></div>
          <span class="level" :style="{ color: strengthColor }">{{ strengthText }}</span>
        </div>
        <div class="strength-rules">
          <span :class="{ ok: rulesMet.length }">至少 6 位</span>
          <span :class="{ ok: rulesMet.letter }">字母</span>
          <span :class="{ ok: rulesMet.digit }">数字</span>
          <span :class="{ ok: rulesMet.special }">特殊字符</span>
        </div>
      </div>

      <van-button type="primary" block round :disabled="!canSubmit" :loading="loading" @click="onSubmit" style="margin-top: 16px">
        确认修改
      </van-button>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { showToast } from 'vant';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const auth = useAuthStore();
const loading = ref(false);
const showPwd = ref(false);
const showPwd2 = ref(false);
const form = reactive({ newPassword: '', confirmPassword: '' });
let logoutTimer: ReturnType<typeof setTimeout> | null = null;

const rulesMet = reactive({
  length: false,
  letter: false,
  digit: false,
  special: false,
});

const onPasswordInput = () => {
  const v = form.newPassword;
  rulesMet.length = v.length >= 6;
  rulesMet.letter = /[a-zA-Z]/.test(v);
  rulesMet.digit = /\d/.test(v);
  rulesMet.special = /[^\w\s]/.test(v);
};

// 已满足的字符类型数（字母/数字/特殊字符）
const typeCount = computed(() => {
  const { letter, digit, special } = rulesMet;
  return [letter, digit, special].filter(Boolean).length;
});

const strength = computed(() => {
  const { length } = rulesMet;
  const v = form.newPassword;
  // 未达最低要求：长度不足6 或 类型不足2类
  if (!length || typeCount.value < 2) return 0;
  let score = 1;
  if (typeCount.value >= 3) score++; // 三类全满足加分
  if (v.length >= 10) score++;
  if (v.length >= 14) score++;
  return Math.min(score, 4);
});

const strengthText = computed(() => ['未达标', '弱', '中', '强', '极强'][strength.value]);
const strengthColor = computed(() => ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'][strength.value]);
const strengthPercent = computed(() => `${(strength.value / 4) * 100}%`);

const canSubmit = computed(() => {
  return rulesMet.length && typeCount.value >= 2 && form.newPassword === form.confirmPassword;
});

const onSubmit = async () => {
  if (!canSubmit.value) {
    showToast('密码不符合要求或两次输入不一致');
    return;
  }
  loading.value = true;
  try {
    await authApi.setPassword(form.newPassword);
    auth.forceChangePassword = false;
    visible.value = false;
    showToast('密码已修改，请重新登录');
    logoutTimer = setTimeout(() => auth.logout(), 800);
  } catch (e: any) {
    showToast(e?.message || '修改失败');
  } finally {
    loading.value = false;
  }
};

onUnmounted(() => {
  if (logoutTimer) {
    clearTimeout(logoutTimer);
    logoutTimer = null;
  }
});
</script>

<style scoped>
.pwd-dialog-body {
  padding: 16px 20px 24px;
}
.hint {
  color: #666;
  font-size: 13px;
  margin: 0 0 16px;
  line-height: 1.6;
}
.field label {
  display: block;
  font-size: 12.5px;
  color: var(--ps-ink-soft);
  font-weight: 500;
  margin-bottom: 7px;
}
.input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 14px;
  background: var(--ps-bg);
  border: 1px solid var(--ps-line);
  border-radius: 12px;
  margin-bottom: 12px;
}
.input-wrap input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--ps-ink);
  font-family: var(--ps-font-sans);
}
.strength-panel {
  background: #f8f8f8;
  border-radius: 8px;
  padding: 12px;
  margin-top: 4px;
}
.strength-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.label {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
}
.bar-wrap {
  flex: 1;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}
.bar {
  height: 100%;
  transition: width 0.2s ease, background-color 0.2s ease;
}
.level {
  font-size: 13px;
  min-width: 40px;
  text-align: right;
}
.strength-rules {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #999;
}
.strength-rules span {
  background: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}
.strength-rules span.ok {
  color: #27ae60;
  border-color: #27ae60;
}
</style>
