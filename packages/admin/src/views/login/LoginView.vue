<template>
  <div class="login-wrap">
    <!-- 左：沉浸品牌区 -->
    <div class="brand">
      <div class="brand-grain"></div>
      <div class="brand-glow one"></div>
      <div class="brand-glow two"></div>

      <div class="brand-inner">
        <div class="seal-row">
          <div class="seal">党</div>
          <div class="seal small">校</div>
        </div>
        <h1 class="brand-title">数智党校</h1>
        <div class="brand-en">DIGITAL · INTELLIGENT · PARTY SCHOOL</div>
        <p class="brand-slogan">以数智赋能党性教育 · 学思践悟守初心</p>

        <div class="brand-feats">
          <div class="feat" v-for="f in feats" :key="f.t">
            <span class="feat-dot"></span>
            <div>
              <div class="feat-t">{{ f.t }}</div>
              <div class="feat-d">{{ f.d }}</div>
            </div>
          </div>
        </div>

        <div class="brand-foot">
          <span class="foot-mark"></span>
          <span class="foot-text">智瀑信息 · 党建数字化解决方案</span>
        </div>
      </div>
    </div>

    <!-- 右：登录表单 -->
    <div class="form-side">
      <div class="form-grain"></div>
      <div class="form-card">
        <div class="form-head">
          <span class="form-tag">管理后台</span>
          <h2>欢迎回来</h2>
          <p>请使用管理员或支部书记账号登录</p>
        </div>

        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @submit.prevent="onSubmit" class="ps-form">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="请输入用户名" size="large">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" size="large" @keyup.enter="onSubmit">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" :loading="loading" size="large" class="submit-btn" @click="onSubmit">
            登 录
          </el-button>
        </el-form>

        <div class="login-tip">
          <template v-if="devMode">
            <div class="tip-line"><span class="tip-k">管理员</span> admin / Admin@123456</div>
            <div class="tip-line"><span class="tip-k">支部书记</span> secretary1 / Admin@123456</div>
          </template>
          <div class="tip-line mobile">党员请使用 <a href="/" target="_blank">移动端学习平台 ›</a></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import type { FormInstance } from 'element-plus';
import { useAuthStore } from '@/store/auth';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ username: '', password: '' });
const devMode = import.meta.env.DEV;
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const feats = [
  { t: '智能学习推荐', d: 'AI 个性化匹配学习内容' },
  { t: '全链路任务管理', d: '布置 · 督学 · 考核闭环' },
  { t: '数据驾驶舱', d: '组织学习态势一目了然' },
];

const onSubmit = async () => {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  loading.value = true;
  try {
    const res = await auth.login(form.username, form.password);
    if (auth.forceChangePassword) {
      // 首次登录强制改密弹窗由 App.vue 全局控制
      ElMessage.warning('首次登录，请修改密码');
      return;
    }
    if (auth.role === 'MEMBER') {
      await auth.logout();
      ElMessage.error('党员请使用移动端学习平台（请访问网站根路径 /）');
      return;
    }
    ElMessage.success('登录成功');
    router.push('/');
  } catch (e: any) {
    // 错误已在拦截器提示
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
}

/* ============ 左侧品牌区 ============ */
.brand {
  position: relative;
  flex: 1 1 56%;
  background: linear-gradient(155deg, #8b1a1a 0%, #6e1414 55%, #4a0b0b 100%);
  color: #fff;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.brand-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
  opacity: 0.18;
  mix-blend-mode: overlay;
}
.brand-glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.brand-glow.one {
  top: -120px;
  right: -80px;
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.28), transparent 70%);
}
.brand-glow.two {
  bottom: -100px;
  left: -60px;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(178, 34, 34, 0.4), transparent 70%);
}

.brand-inner {
  position: relative;
  z-index: 2;
  padding: 0 7vw;
  max-width: 640px;
  animation: ps-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.seal-row {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
}
.seal {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  background: linear-gradient(135deg, #d8b873, #a8893e);
  color: #4a0b0b;
  font-family: var(--ps-font-serif);
  font-weight: 900;
  font-size: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
}
.seal.small {
  width: 44px;
  height: 44px;
  font-size: 24px;
  align-self: flex-end;
  background: rgba(201, 169, 97, 0.16);
  border: 1.5px solid rgba(201, 169, 97, 0.5);
  color: #e8d9b5;
  box-shadow: none;
}
.brand-title {
  margin: 0;
  font-family: var(--ps-font-serif);
  font-size: 60px;
  font-weight: 900;
  letter-spacing: 12px;
  line-height: 1.1;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
.brand-en {
  margin-top: 14px;
  font-size: 11px;
  letter-spacing: 4px;
  color: rgba(201, 169, 97, 0.8);
  font-weight: 500;
}
.brand-slogan {
  margin: 22px 0 0;
  font-family: var(--ps-font-serif);
  font-size: 16px;
  letter-spacing: 2px;
  color: rgba(255, 244, 234, 0.82);
  border-left: 2px solid rgba(201, 169, 97, 0.6);
  padding-left: 14px;
}

.brand-feats {
  margin-top: 44px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.feat {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.feat-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: #c9a961;
  box-shadow: 0 0 0 4px rgba(201, 169, 97, 0.18);
}
.feat-t {
  font-family: var(--ps-font-serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}
.feat-d {
  font-size: 12.5px;
  color: rgba(255, 244, 234, 0.62);
  margin-top: 3px;
}

.brand-foot {
  margin-top: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.foot-mark {
  width: 24px;
  height: 1px;
  background: rgba(201, 169, 97, 0.6);
}
.foot-text {
  font-size: 11px;
  letter-spacing: 2px;
  color: rgba(201, 169, 97, 0.7);
}

/* ============ 右侧表单区 ============ */
.form-side {
  position: relative;
  flex: 1 1 44%;
  background: var(--ps-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.form-grain {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 80% 20%, rgba(201, 169, 97, 0.1), transparent 40%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none;
}
.form-card {
  position: relative;
  z-index: 2;
  width: 380px;
  padding: 8px 8px 0;
  animation: ps-fade-up 0.7s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.form-head {
  margin-bottom: 28px;
}
.form-tag {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 4px 12px;
  border-radius: 999px;
  font-weight: 500;
  margin-bottom: 16px;
}
.form-head h2 {
  margin: 0;
  font-family: var(--ps-font-serif);
  font-size: 34px;
  font-weight: 700;
  color: var(--ps-ink);
  letter-spacing: 2px;
}
.form-head p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--ps-muted);
}

.ps-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--ps-ink-soft);
  font-weight: 500;
  padding-bottom: 4px;
}
.ps-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--ps-line);
  border-radius: 10px;
  padding: 4px 14px;
}
.ps-form :deep(.el-input__inner) {
  height: 44px;
}

.submit-btn {
  width: 100%;
  height: 48px;
  font-size: 15px;
  letter-spacing: 6px;
  margin-top: 8px;
}

.login-tip {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px dashed var(--ps-line);
}
.tip-line {
  font-size: 12px;
  color: var(--ps-muted);
  line-height: 1.9;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tip-k {
  font-family: var(--ps-font-serif);
  font-size: 11px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.tip-line.mobile {
  margin-top: 8px;
  justify-content: center;
}
.tip-line a {
  color: var(--ps-red);
  font-weight: 500;
}

/* 响应式：窄屏隐藏左侧品牌区 */
@media (max-width: 900px) {
  .brand {
    display: none;
  }
  .form-side {
    flex: 1;
  }
}
</style>
