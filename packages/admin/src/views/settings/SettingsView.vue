<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>AI 模型配置</span>
          <span v-if="configured" class="status-ok"><el-icon><CircleCheck /></el-icon> 已配置</span>
        </div>
      </template>

      <el-alert
        v-if="!configured"
        type="warning"
        :closable="false"
        show-icon
        title="尚未配置有效的 API Key"
        description="当前 AI 功能（智能推荐 / 自然语言数据查询 / 综合评价报告）将不可用。请在下方填写后点击“保存配置”。"
        style="margin-bottom: 16px"
      />

      <el-form :model="form" label-width="120px" style="max-width: 680px">
        <el-form-item label="模型服务商">
          <el-select v-model="form.provider" style="width: 100%" @change="onProviderChange">
            <el-option v-for="p in presets" :key="p.key" :label="p.label" :value="p.key">
              <span>{{ p.label }}</span>
              <span v-if="p.note" class="preset-note">{{ p.note }}</span>
            </el-option>
          </el-select>
          <div class="hint">已支持国内主流大模型（均为 OpenAI 兼容接口），选中后自动填入地址与模型名，可再手动微调</div>
          <div v-if="presetNote" class="hint preset-warn">{{ presetNote }}</div>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" placeholder="sk-...">
            <template #append>
              <el-button @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="API 基础地址">
          <el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </el-form-item>
        <el-form-item label="对话模型">
          <el-select
            v-model="form.chatModel"
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="选择或输入模型名"
            style="width: 100%"
          >
            <el-option v-for="m in models" :key="m.id" :label="m.id" :value="m.id">
              <span>{{ m.id }}</span>
              <el-tag v-if="isFree(m.id)" size="small" type="success" class="free-tag">免费</el-tag>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="推理模型">
          <el-select
            v-model="form.reasonerModel"
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            clearable
            placeholder="选择或输入模型名（可留空）"
            style="width: 100%"
          >
            <el-option v-for="m in models" :key="m.id" :label="m.id" :value="m.id">
              <span>{{ m.id }}</span>
              <el-tag v-if="isFree(m.id)" size="small" type="success" class="free-tag">免费</el-tag>
            </el-option>
          </el-select>
          <div class="hint">可留空，留空时自动使用对话模型（部分服务商无独立推理模型）</div>
        </el-form-item>
        <el-form-item label="模型列表">
          <div class="model-list-bar">
            <span class="model-count" :class="{ 'model-count-err': modelsError }">
              {{ modelsError || (models.length ? `已从服务商获取 ${models.length} 个模型` : '切换服务商或点击刷新自动获取') }}
            </span>
            <el-button size="small" :loading="fetchingModels" @click="fetchModels">刷新模型列表</el-button>
          </div>
          <div class="hint">下拉中带 <el-tag size="small" type="success" class="free-tag">免费</el-tag> 标记的为免费模型（基于公开信息，以厂商实际计费为准）</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="testing" @click="testConnection">测试连接</el-button>
          <el-button type="success" :loading="saving" @click="save">保存配置</el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="testResult"
        :type="testResult.ok ? 'success' : 'error'"
        :closable="true"
        show-icon
        :title="testResult.ok ? `连接成功（模型：${testResult.model}）` : `连接失败：${testResult.error}`"
        style="max-width: 660px"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { settingsApi } from '@/api';
import {
  AI_PROVIDER_PRESETS,
  aiProviderPreset,
  isFreeModel,
  type TestAiConfigResult,
  type AiModelInfo,
} from '@ai-party-school/shared';

const presets = AI_PROVIDER_PRESETS;

const form = reactive({
  provider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  chatModel: '',
  reasonerModel: '',
});

/** 从服务商拉取的模型列表 */
const models = ref<AiModelInfo[]>([]);
const fetchingModels = ref(false);
const modelsError = ref('');

const showKey = ref(false);
const testing = ref(false);
const saving = ref(false);
const configured = ref(false);
const testResult = ref<TestAiConfigResult | null>(null);

const hasConfiguredKey = (key?: string) =>
  Boolean(key && key !== '***' && !key.toLowerCase().includes('redacted') && !key.includes('未配置'));

const isFree = (id: string) => isFreeModel(form.provider, id);

/** 当前预设的说明（如豆包/星火有额外开通提示） */
const presetNote = computed(() => aiProviderPreset(form.provider).note);

async function load() {
  try {
    const cfg = await settingsApi.getAi();
    form.provider = cfg.provider || aiProviderPreset(cfg.baseUrl).key;
    form.apiKey = cfg.apiKey;
    form.baseUrl = cfg.baseUrl;
    form.chatModel = cfg.chatModel;
    form.reasonerModel = cfg.reasonerModel ?? '';
    configured.value = hasConfiguredKey(cfg.apiKey);
    testResult.value = null;
    // 已配置 Key 时自动拉取模型列表
    if (configured.value) fetchModels();
  } catch {
    ElMessage.error('加载配置失败');
  }
}

/** 从服务商自动获取模型列表（失败静默降级，不影响手动输入） */
async function fetchModels() {
  fetchingModels.value = true;
  modelsError.value = '';
  try {
    const res = await settingsApi.listAiModels({ ...form });
    models.value = res.models ?? [];
    if (models.value.length === 0) modelsError.value = '服务商返回的模型列表为空';
  } catch (e: any) {
    models.value = [];
    modelsError.value = e?.response?.data?.message || e?.message || '获取模型列表失败';
  } finally {
    fetchingModels.value = false;
  }
}

/** 切换服务商时自动填入该厂商的默认地址与模型名，并拉取模型列表 */
function onProviderChange(key: string) {
  const p = aiProviderPreset(key);
  if (p.key !== 'custom') {
    form.baseUrl = p.baseUrl;
    form.chatModel = p.chatModel;
    form.reasonerModel = p.reasonerModel;
  }
  testResult.value = null;
  fetchModels();
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const res = await settingsApi.testAi({
      ...form,
      apiKey: form.apiKey.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
      chatModel: form.chatModel.trim(),
      reasonerModel: form.reasonerModel.trim(),
    });
    testResult.value = res;
    if (res.ok) ElMessage.success('连接成功');
    else ElMessage.error(`连接失败：${res.error}`);
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    testing.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const cfg = await settingsApi.updateAi({
      ...form,
      apiKey: form.apiKey.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
      chatModel: form.chatModel.trim(),
      reasonerModel: form.reasonerModel.trim(),
    });
    form.provider = cfg.provider;
    form.apiKey = cfg.apiKey;
    form.baseUrl = cfg.baseUrl;
    form.chatModel = cfg.chatModel;
    form.reasonerModel = cfg.reasonerModel ?? '';
    configured.value = hasConfiguredKey(cfg.apiKey);
    testResult.value = null;
    ElMessage.success('AI 配置已保存，立即生效（无需重启）');
  } catch {
    // 错误已由 http 拦截器提示
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page-container {
  padding: 4px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.status-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #67c23a;
  font-size: 13px;
}
.hint {
  width: 100%;
  font-size: 12px;
  color: var(--ps-muted);
  line-height: 1.6;
  margin-top: 4px;
}
.preset-warn {
  color: #b88230;
}
.preset-note {
  float: right;
  font-size: 12px;
  color: var(--ps-muted);
  margin-left: 16px;
}
.model-list-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.model-count {
  font-size: 12.5px;
  color: var(--ps-muted);
}
.model-count-err {
  color: #e6a23c;
}
.free-tag {
  float: right;
  margin-left: 12px;
  margin-top: 2px;
}
</style>
