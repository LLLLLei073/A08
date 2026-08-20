<template>
  <el-dialog
    v-model="visible"
    append-to-body
    title="首次登录：请修改密码"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    align-center
  >
    <p class="hint">为了您的账户安全，首次登录后请先设置一个符合强度要求的新密码。</p>

    <el-form :model="form" :rules="rules" ref="formRef" label-width="90px" @submit.prevent="onSubmit">
      <el-form-item label="新密码" prop="newPassword">
        <el-input
          v-model="form.newPassword"
          type="password"
          show-password
          placeholder="请输入新密码"
          @input="onPasswordInput"
        />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          placeholder="请再次输入新密码"
        />
      </el-form-item>
    </el-form>

    <div class="strength-panel">
      <div class="strength-row">
        <span class="label">密码强度</span>
        <div class="bar-wrap">
          <div class="bar" :style="{ width: strengthPercent, backgroundColor: strengthColor }"></div>
        </div>
        <span class="level" :style="{ color: strengthColor }">{{ strengthText }}</span>
      </div>
      <ul class="strength-rules">
        <li :class="{ ok: rulesMet.length }">至少 6 位</li>
        <li :class="{ ok: rulesMet.letter }">字母</li>
        <li :class="{ ok: rulesMet.digit }">数字</li>
        <li :class="{ ok: rulesMet.special }">特殊字符</li>
      </ul>
    </div>

    <template #footer>
      <el-button type="primary" :loading="loading" :disabled="!canSubmit" @click="onSubmit">
        确认修改
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const auth = useAuthStore();
const formRef = ref<any>(null);
const loading = ref(false);
const form = reactive({ newPassword: '', confirmPassword: '' });
let logoutTimer: ReturnType<typeof setTimeout> | null = null;

const rules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_: any, value: string, callback: (err?: Error) => void) => {
        if (value !== form.newPassword) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
};

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

const strengthText = computed(() => {
  const map = ['未达标', '弱', '中', '强', '极强'];
  return map[strength.value];
});

const strengthColor = computed(() => {
  const map = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'];
  return map[strength.value];
});

const strengthPercent = computed(() => `${(strength.value / 4) * 100}%`);

const canSubmit = computed(() => {
  return rulesMet.length && typeCount.value >= 2 && form.newPassword === form.confirmPassword;
});

const onSubmit = async () => {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  loading.value = true;
  try {
    await authApi.setPassword(form.newPassword);
    auth.forceChangePassword = false;
    visible.value = false;
    ElMessage.success('密码已修改，请重新登录');
    logoutTimer = setTimeout(() => auth.logout(), 800);
  } catch (e: any) {
    ElMessage.error(e?.message || '修改失败');
  } finally {
    loading.value = false;
  }
};

onUnmounted(() => {
  if (logoutTimer) clearTimeout(logoutTimer);
});
</script>

<style scoped>
.hint {
  color: #666;
  font-size: 13px;
  margin: 0 0 18px;
  line-height: 1.6;
}
.strength-panel {
  background: #f8f8f8;
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 8px;
}
.strength-row {
  display: flex;
  align-items: center;
  gap: 12px;
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
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  font-size: 12px;
  color: #999;
}
.strength-rules li::before {
  content: '○';
  margin-right: 6px;
}
.strength-rules li.ok {
  color: #27ae60;
}
.strength-rules li.ok::before {
  content: '✓';
}
</style>
