<template>
  <div class="login-page">
    <div class="hero">
      <div class="hero-grain"></div>
      <div class="hero-glow"></div>
      <div class="hero-inner">
        <div class="seal-row">
          <div class="seal">党</div>
          <div class="seal small">校</div>
        </div>
        <h1 class="hero-title">数智党校</h1>
        <div class="hero-en">DIGITAL PARTY SCHOOL</div>
        <p class="hero-slogan">学思践悟守初心 · 以学促干担使命</p>
      </div>
      <div class="hero-wave"></div>
    </div>

    <div class="form-area">
      <div class="form-card">
        <div class="form-head">
          <span class="form-tag">党员学习平台</span>
          <h2>欢迎登录</h2>
          <p>请使用党员或支部书记账号登录</p>
        </div>

        <div class="fields">
          <div class="field">
            <label>用户名</label>
            <div class="input-wrap">
              <van-icon name="manager-o" size="18" color="#8a8276" />
              <input v-model="form.username" placeholder="请输入用户名" />
            </div>
          </div>
          <div class="field">
            <label>密码</label>
            <div class="input-wrap">
              <van-icon name="lock" size="18" color="#8a8276" />
              <input v-model="form.password" :type="showPwd ? 'text' : 'password'" placeholder="请输入密码" @keyup.enter="onSubmit" />
              <van-icon :name="showPwd ? 'eye-o' : 'closed-eye'" size="18" color="#8a8276" @click="showPwd = !showPwd" />
            </div>
          </div>
        </div>

        <van-button type="primary" block round :loading="loading" class="submit" @click="onSubmit">
          登 录
        </van-button>

        <div class="tip" v-if="devMode">
          <div class="tip-line"><span class="tip-k">党员</span> member1-6 / Party@123456</div>
          <div class="tip-line"><span class="tip-k">书记</span> secretary1 / Admin@123456</div>
          <div class="tip-line"><span class="tip-k">管理员</span> admin / Admin@123456</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { useAuthStore } from '@/store/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const showPwd = ref(false);
const form = reactive({ username: '', password: '' });
const devMode = import.meta.env.DEV;

const onSubmit = async () => {
  if (!form.username || !form.password) {
    showToast('请填写完整');
    return;
  }
  loading.value = true;
  try {
    const res = await auth.login(form.username, form.password);
    if (auth.forceChangePassword) {
      showToast('首次登录，请先修改密码');
      return;
    }
    showToast('登录成功');
    router.push('/home');
  } catch {} finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--ps-bg);
}

/* ============ 顶部品牌区 ============ */
.hero {
  position: relative;
  overflow: hidden;
  padding: 64px 28px 56px;
  background: linear-gradient(155deg, #8b1a1a 0%, #6e1414 60%, #4a0b0b 100%);
  color: #fff;
}
.hero-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.16;
  mix-blend-mode: overlay;
}
.hero-glow {
  position: absolute;
  top: -60px;
  right: -50px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.3), transparent 70%);
}
.hero-inner {
  position: relative;
  z-index: 2;
  animation: ps-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.seal-row {
  display: flex;
  gap: 10px;
  margin-bottom: 22px;
}
.seal {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: linear-gradient(135deg, #d8b873, #a8893e);
  color: #4a0b0b;
  font-family: var(--ps-font-serif);
  font-weight: 900;
  font-size: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
}
.seal.small {
  width: 38px;
  height: 38px;
  font-size: 20px;
  align-self: flex-end;
  background: rgba(201, 169, 97, 0.16);
  border: 1.5px solid rgba(201, 169, 97, 0.5);
  color: #e8d9b5;
  box-shadow: none;
}
.hero-title {
  margin: 0;
  font-family: var(--ps-font-serif);
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 8px;
  line-height: 1.1;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}
.hero-en {
  margin-top: 10px;
  font-size: 10px;
  letter-spacing: 3px;
  color: rgba(201, 169, 97, 0.82);
  font-weight: 500;
}
.hero-slogan {
  margin: 18px 0 0;
  font-family: var(--ps-font-serif);
  font-size: 14px;
  letter-spacing: 1.5px;
  color: rgba(255, 244, 234, 0.8);
  border-left: 2px solid rgba(201, 169, 97, 0.6);
  padding-left: 12px;
}
.hero-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 24px;
  background: var(--ps-bg);
  border-radius: 24px 24px 0 0;
}

/* ============ 表单区 ============ */
.form-area {
  padding: 8px 22px 40px;
}
.form-card {
  background: var(--ps-surface);
  border-radius: 18px;
  padding: 28px 22px;
  box-shadow: var(--ps-shadow-md);
  margin-top: -20px;
  position: relative;
  z-index: 2;
  animation: ps-fade-up 0.6s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.form-head {
  margin-bottom: 24px;
}
.form-tag {
  display: inline-block;
  font-size: 10.5px;
  letter-spacing: 1.5px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 500;
  margin-bottom: 12px;
}
.form-head h2 {
  margin: 0;
  font-family: var(--ps-font-serif);
  font-size: 26px;
  font-weight: 700;
  color: var(--ps-ink);
  letter-spacing: 2px;
}
.form-head p {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--ps-muted);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.input-wrap:focus-within {
  border-color: var(--ps-red);
  box-shadow: 0 0 0 4px rgba(201, 169, 97, 0.16);
  background: #fff;
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
.input-wrap input::placeholder {
  color: #b8b0a2;
}

.submit {
  height: 48px;
  margin-top: 24px;
  font-size: 15px;
  letter-spacing: 6px;
}

.tip {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--ps-line);
}
.tip-line {
  font-size: 12px;
  color: var(--ps-muted);
  line-height: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tip-k {
  font-family: var(--ps-font-serif);
  font-size: 10.5px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 500;
}
.tip-line.pwd {
  margin-top: 4px;
  justify-content: center;
  color: #b8b0a2;
  font-size: 11.5px;
}
</style>
