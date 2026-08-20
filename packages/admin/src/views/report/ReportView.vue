<template>
  <div class="report-page">
    <div class="page-inner">
      <!-- 操作区 -->
      <el-card shadow="never" class="op-card">
        <div class="op-header">
          <div class="op-title">AI 评价报告管理</div>
          <div class="op-actions">
            <el-button type="primary" @click="genDialog = true">生成报告</el-button>
            <el-button @click="loadSchedule" v-if="auth.role === 'ADMIN'">定时设置</el-button>
            <el-button @click="loadList">刷新</el-button>
          </div>
        </div>

        <el-form :inline="true" :model="filter" class="filter-form">
          <el-form-item label="支部">
            <el-select v-model="filter.orgId" placeholder="全部" clearable style="width: 160px" @change="loadList">
              <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="周期">
            <el-select v-model="filter.period" placeholder="全部" clearable style="width: 120px" @change="loadList">
              <el-option label="日报" value="DAILY" />
              <el-option label="周报" value="WEEKLY" />
              <el-option label="月报" value="MONTHLY" />
              <el-option label="季报" value="QUARTERLY" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filter.published" placeholder="全部" clearable style="width: 120px" @change="loadList">
              <el-option label="已下发" :value="true" />
              <el-option label="未下发" :value="false" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 报告列表 -->
      <el-card shadow="never" class="list-card">
        <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
          <el-table-column type="selection" width="45" />
          <el-table-column prop="userName" label="党员" width="100" />
          <el-table-column prop="orgName" label="支部" width="120" />
          <el-table-column prop="score" label="综合分" width="80" sortable>
            <template #default="{ row }">
              <span :class="['score', row.score >= 80 ? 'good' : row.score >= 60 ? 'ok' : 'bad']">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="periodType" label="周期" width="80">
            <template #default="{ row }">{{ periodLabel(row.periodType) }}</template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.source === 'AUTO' ? 'info' : 'warning'">{{ row.source === 'AUTO' ? '定时' : '手动' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="publishedAt" label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.publishedAt ? 'success' : 'danger'">{{ row.publishedAt ? '已下发' : '未下发' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="generatedAt" label="生成时间" width="160">
            <template #default="{ row }">{{ formatTime(row.generatedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link @click="viewDetail(row)">查看</el-button>
              <el-button v-if="!row.publishedAt" size="small" type="primary" @click="publishOne(row)">下发</el-button>
              <el-button v-if="!row.publishedAt" size="small" link type="danger" @click="removeOne(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="batch-bar" v-if="selected.length > 0">
          <span>已选 {{ selected.length }} 项</span>
          <el-button size="small" type="primary" @click="publishBatch">批量下发</el-button>
        </div>

        <el-pagination
          v-model:current-page="filter.page"
          v-model:page-size="filter.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadList"
          style="margin-top: 16px; justify-content: flex-end"
        />
      </el-card>
    </div>

    <!-- 生成报告对话框 -->
    <el-dialog v-model="genDialog" title="生成 AI 报告" width="520px" append-to-body>
      <el-form :model="genForm" label-width="100px">
        <el-form-item label="统计周期">
          <el-select v-model="genForm.period" style="width: 100%">
            <el-option label="日报（DAILY）" value="DAILY" />
            <el-option label="周报（WEEKLY）" value="WEEKLY" />
            <el-option label="月报（MONTHLY）" value="MONTHLY" />
            <el-option label="季报（QUARTERLY）" value="QUARTERLY" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成范围">
          <el-radio-group v-model="genForm.rangeMode">
            <el-radio :value="'org'">按支部</el-radio>
            <el-radio :value="'user'">指定人员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="支部" v-if="genForm.rangeMode === 'org'">
          <el-select v-model="genForm.orgIds" multiple placeholder="留空=本支部/全部" style="width: 100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="人员" v-if="genForm.rangeMode === 'user'">
          <el-select v-model="genForm.userIds" multiple filterable placeholder="选择党员" style="width: 100%">
            <el-option v-for="u in users" :key="u.id" :label="u.name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成后下发">
          <el-switch v-model="genForm.publish" />
        </el-form-item>
        <el-form-item label="覆盖已有">
          <el-switch v-model="genForm.overwrite" />
          <span class="hint">同周期已生成时是否重新计算</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialog = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="doGenerate">开始生成</el-button>
      </template>
    </el-dialog>

    <!-- 定时设置对话框 -->
    <el-dialog v-model="schedDialog" title="报告定时生成设置" width="520px" v-if="auth.role === 'ADMIN'" append-to-body>
      <el-form :model="schedForm" label-width="110px" v-loading="schedLoading">
        <el-form-item label="启用定时">
          <el-switch v-model="schedForm.enabled" />
        </el-form-item>
        <el-form-item label="统计周期">
          <el-select v-model="schedForm.period" style="width: 100%">
            <el-option label="日报" value="DAILY" />
            <el-option label="周报" value="WEEKLY" />
            <el-option label="月报" value="MONTHLY" />
            <el-option label="季报" value="QUARTERLY" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成间隔">
          <el-input-number v-model="schedForm.intervalHours" :min="1" :max="2160" />
          <span class="hint" style="margin-left: 8px">小时</span>
        </el-form-item>
        <el-form-item label="自动下发">
          <el-switch v-model="schedForm.autoPublish" />
        </el-form-item>
        <el-form-item label="限定支部">
          <el-select v-model="schedForm.orgIds" multiple placeholder="留空=全部支部" style="width: 100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上次执行" v-if="schedInfo.lastRunAt">
          <span>{{ formatTime(schedInfo.lastRunAt) }} — {{ schedInfo.lastResult || '无摘要' }}</span>
        </el-form-item>
        <el-form-item label="下次执行" v-if="schedInfo.nextRunAt">
          <span>{{ formatTime(schedInfo.nextRunAt) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="schedDialog = false">取消</el-button>
        <el-button @click="runScheduleNow" :loading="running">立即执行一次</el-button>
        <el-button type="primary" @click="saveSchedule">保存设置</el-button>
      </template>
    </el-dialog>

    <!-- 报告详情 -->
    <el-drawer v-model="detailDrawer" title="报告详情" size="600px" append-to-body>
      <div v-if="detail" class="detail-body">
        <div class="detail-score">
          <div class="ds-num">{{ detail.score }}</div>
          <div class="ds-label">综合评分</div>
          <div class="ds-meta">{{ detail.userName }} · {{ periodLabel(detail.periodType) }} · {{ formatTime(detail.generatedAt) }}</div>
        </div>
        <div class="detail-section">
          <div class="ds-title">总体评语</div>
          <div class="ds-text">{{ detail.comment }}</div>
        </div>
        <div class="detail-section">
          <div class="ds-title">优势</div>
          <ul class="ds-list"><li v-for="(s, i) in detail.strengths" :key="i">{{ s }}</li></ul>
        </div>
        <div class="detail-section">
          <div class="ds-title">待改进</div>
          <ul class="ds-list"><li v-for="(s, i) in detail.weaknesses" :key="i">{{ s }}</li></ul>
        </div>
        <div class="detail-section">
          <div class="ds-title">改进建议</div>
          <ol class="ds-list"><li v-for="(s, i) in detail.suggestions" :key="i">{{ s }}</li></ol>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import { reportApi, orgApi, userApi } from '@/api';

const auth = useAuthStore();

const orgs = ref<any[]>([]);
const users = ref<any[]>([]);
const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const selected = ref<any[]>([]);

const filter = reactive({ page: 1, pageSize: 20, orgId: undefined as number | undefined, period: undefined as string | undefined, published: undefined as boolean | undefined });

const genDialog = ref(false);
const generating = ref(false);
const genForm = reactive({
  period: 'WEEKLY',
  rangeMode: 'org' as 'org' | 'user',
  orgIds: [] as number[],
  userIds: [] as number[],
  publish: true,
  overwrite: false,
});

const schedDialog = ref(false);
const schedLoading = ref(false);
const running = ref(false);
const schedInfo = ref<any>({});
const schedForm = reactive({ enabled: false, period: 'WEEKLY', intervalHours: 168, autoPublish: true, orgIds: [] as number[] });

const detailDrawer = ref(false);
const detail = ref<any>(null);

const periodLabel = (p?: string) => ({ DAILY: '日报', WEEKLY: '周报', MONTHLY: '月报', QUARTERLY: '季报' } as any)[p ?? 'WEEKLY'] ?? '报告';
const formatTime = (s?: string) => (s ? new Date(s).toLocaleString('zh-CN') : '-');

const loadOrgs = async () => {
  const tree: any = await orgApi.tree();
  const flat: any[] = [];
  const walk = (nodes: any[]) => nodes.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
  walk(tree);
  orgs.value = flat;
};

const loadUsers = async () => {
  const res: any = await userApi.list({ page: 1, pageSize: 100 });
  users.value = res.list ?? [];
};

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await reportApi.list({ ...filter });
    list.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
};

const onSelect = (rows: any[]) => { selected.value = rows; };

const doGenerate = async () => {
  generating.value = true;
  try {
    const payload: any = { period: genForm.period, publish: genForm.publish, overwrite: genForm.overwrite };
    if (genForm.rangeMode === 'org') payload.orgIds = genForm.orgIds;
    else payload.userIds = genForm.userIds;
    const res: any = await reportApi.generate(payload);
    ElMessage.success(`生成 ${res.generated}，跳过 ${res.skipped}，失败 ${res.failed}，下发 ${res.published}`);
    genDialog.value = false;
    loadList();
  } catch (e: any) {
    ElMessage.error(e.message || '生成失败');
  } finally {
    generating.value = false;
  }
};

const publishOne = async (row: any) => {
  try {
    await reportApi.publish([row.id]);
    ElMessage.success('已下发');
    loadList();
  } catch (e: any) { ElMessage.error(e.message || '下发失败'); }
};

const publishBatch = async () => {
  const ids = selected.value.map((r) => r.id).filter((id) => !selected.value.find((r) => r.id === id)?.publishedAt);
  if (ids.length === 0) { ElMessage.warning('请选择未下发的报告'); return; }
  try {
    const res: any = await reportApi.publish(ids);
    ElMessage.success(`已下发 ${res.published} 份`);
    loadList();
  } catch (e: any) { ElMessage.error(e.message || '下发失败'); }
};

const removeOne = async (row: any) => {
  try {
    await ElMessageBox.confirm('确认删除该未下发报告？', '提示', { type: 'warning' });
    await reportApi.remove(row.id);
    ElMessage.success('已删除');
    loadList();
  } catch {}
};

const viewDetail = async (row: any) => {
  detail.value = await reportApi.detail(row.id);
  detailDrawer.value = true;
};

const loadSchedule = async () => {
  schedLoading.value = true;
  try {
    const res: any = await reportApi.getSchedule();
    schedInfo.value = res;
    schedForm.enabled = res.enabled;
    schedForm.period = res.period;
    schedForm.intervalHours = res.intervalHours;
    schedForm.autoPublish = res.autoPublish;
    schedForm.orgIds = res.orgIds ?? [];
    schedDialog.value = true;
  } catch (e: any) { ElMessage.error(e.message || '加载失败'); }
  finally { schedLoading.value = false; }
};

const saveSchedule = async () => {
  try {
    await reportApi.updateSchedule({ ...schedForm });
    ElMessage.success('定时设置已保存');
    schedDialog.value = false;
  } catch (e: any) { ElMessage.error(e.message || '保存失败'); }
};

const runScheduleNow = async () => {
  running.value = true;
  try {
    const res: any = await reportApi.runSchedule();
    ElMessage.success(`执行完成：生成 ${res.generated}，下发 ${res.published}`);
    loadSchedule();
    loadList();
  } catch (e: any) { ElMessage.error(e.message || '执行失败'); }
  finally { running.value = false; }
};

onMounted(async () => {
  await loadOrgs();
  loadUsers();
  loadList();
});
</script>

<style scoped>
.report-page { padding: 20px 28px; }
.page-inner { max-width: 1200px; margin: 0 auto; }
.op-card, .list-card { margin-bottom: 16px; }
.op-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.op-title { font-size: 17px; font-weight: 600; color: var(--ps-ink); }
.filter-form { margin-top: 4px; }
.score { font-weight: 700; }
.score.good { color: #07c160; }
.score.ok { color: #e6a23c; }
.score.bad { color: #ee0a24; }
.batch-bar { margin-top: 12px; display: flex; align-items: center; gap: 12px; color: var(--ps-muted); font-size: 13px; }
.hint { color: var(--ps-muted); font-size: 12px; margin-left: 4px; }

.detail-body { padding: 0 8px; }
.detail-score { text-align: center; padding: 24px; background: linear-gradient(135deg, #8b1a1a, #6e1414); color: #fff; border-radius: 12px; margin-bottom: 20px; }
.ds-num { font-size: 48px; font-weight: 800; line-height: 1; }
.ds-label { font-size: 14px; opacity: 0.9; margin-top: 6px; }
.ds-meta { font-size: 12px; opacity: 0.7; margin-top: 10px; }
.detail-section { margin-bottom: 18px; }
.ds-title { font-weight: 600; font-size: 14px; color: var(--ps-ink); margin-bottom: 8px; padding-left: 8px; border-left: 3px solid var(--ps-red); }
.ds-text { font-size: 14px; line-height: 1.7; color: var(--ps-ink); padding: 0 8px; }
.ds-list { margin: 0; padding-left: 24px; }
.ds-list li { font-size: 14px; line-height: 1.8; color: var(--ps-ink); }
</style>
