<template>
  <div class="knowledge-page">
    <section class="atlas-head">
      <div>
        <span class="eyebrow">ADAPTIVE LEARNING ATLAS · GRAPH-BKT-V1</span>
        <h1>知识能力图谱</h1>
        <p>把课程、试题与先修关系编织成可解释的党员学习路径。</p>
      </div>
      <div class="head-actions">
        <el-button @click="loadAll">刷新数据</el-button>
        <el-button v-if="isAdmin" type="primary" @click="openNode()">新增知识点</el-button>
      </div>
    </section>

    <div class="metric-strip">
      <div><strong>{{ graph.nodes.length }}</strong><span>知识节点</span></div>
      <div><strong>{{ graph.edges.length }}</strong><span>先修关系</span></div>
      <div><strong>{{ contentBindingCount }}</strong><span>课程关联</span></div>
      <div><strong>V{{ graph.version }}</strong><span>图谱版本</span></div>
    </div>

    <section class="atlas-grid">
      <el-card class="graph-card" shadow="never">
        <template #header>
          <div class="section-head">
            <div><b>先修关系全景</b><small>箭头由基础知识指向进阶知识</small></div>
            <el-button v-if="isAdmin" type="primary" @click="edgeDialog = true">新增关系</el-button>
          </div>
        </template>
        <div ref="chartEl" class="graph-canvas" />
        <el-empty v-if="!graph.nodes.length" description="新增知识点后生成图谱" />
      </el-card>

      <el-card class="preview-card" shadow="never">
        <template #header>
          <div class="section-head"><div><b>党员路径预演</b><small>书记仅能查看本支部党员</small></div></div>
        </template>
        <el-select v-model="selectedUserId" filterable placeholder="选择党员" style="width: 100%" @change="loadUserPath">
          <el-option v-for="user in users" :key="user.id" :label="`${user.name} · ${user.org?.name || user.orgName || ''}`" :value="user.id" />
        </el-select>
        <div v-if="userPath" class="path-preview" v-loading="pathLoading">
          <div class="mastery-line">
            <span>平均掌握度</span><b>{{ averageMastery }}%</b>
          </div>
          <div v-for="item in userPath.items" :key="`${item.rank}-${item.contentId}`" class="preview-step">
            <span class="step-rank">{{ String(item.rank).padStart(2, '0') }}</span>
            <div><b>{{ item.title }}</b><small>{{ item.nodeName }} · 掌握度 {{ Math.round(item.mastery * 100) }}%</small></div>
          </div>
          <el-empty v-if="!userPath.items.length" description="暂无可推荐内容" :image-size="60" />
        </div>
        <el-empty v-else description="选择党员查看个性化路径" :image-size="86" />
      </el-card>
    </section>

    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="section-head"><div><b>节点与资源校订</b><small>维护课程、试题和BKT参数</small></div>
          <el-button v-if="isAdmin" text type="primary" @click="bindingDialog = true">新增资源关联</el-button>
        </div>
      </template>
      <el-table :data="graph.nodes" v-loading="loading" row-key="id">
        <el-table-column prop="code" label="编码" width="110" />
        <el-table-column label="知识点" min-width="160">
          <template #default="{ row }"><b>{{ row.name }}</b><div class="muted">{{ row.category }}</div></template>
        </el-table-column>
        <el-table-column label="难度" width="130"><template #default="{ row }"><el-rate :model-value="row.difficulty" disabled /></template></el-table-column>
        <el-table-column label="BKT参数" width="190"><template #default="{ row }"><code>P₀ {{ row.pInit }} · T {{ row.pLearn }} · S {{ row.pSlip }}</code></template></el-table-column>
        <el-table-column label="关联课程/试题" min-width="280">
          <template #default="{ row }">
            <el-tag v-for="binding in row.contents" :key="`c${binding.contentId}`" class="binding-tag" effect="plain">
              课 · {{ binding.content.title }}
              <el-icon v-if="isAdmin" class="tag-close" @click.stop="removeBinding('CONTENT', binding.contentId, row.id)"><Close /></el-icon>
            </el-tag>
            <el-tag v-for="binding in row.questions" :key="`q${binding.questionId}`" class="binding-tag" type="warning" effect="plain">
              题 · {{ truncate(binding.question.stem, 16) }}
              <el-icon v-if="isAdmin" class="tag-close" @click.stop="removeBinding('QUESTION', binding.questionId, row.id)"><Close /></el-icon>
            </el-tag>
            <span v-if="!row.contents.length && !row.questions.length" class="muted">尚未关联</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="150" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openNode(row)">编辑</el-button><el-button link type="danger" @click="removeNode(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <div v-if="isAdmin && graph.edges.length" class="edge-list">
        <span class="edge-label">先修边</span>
        <el-tag v-for="edge in graph.edges" :key="edge.id" closable @close="removeEdge(edge.id)">
          {{ nodeName(edge.fromNodeId) }} → {{ nodeName(edge.toNodeId) }}
        </el-tag>
      </div>
    </el-card>

    <el-dialog v-model="nodeDialog" :title="editingNodeId ? '编辑知识点' : '新增知识点'" width="560px">
      <el-form :model="nodeForm" label-width="96px">
        <el-row :gutter="14"><el-col :span="10"><el-form-item label="编码"><el-input v-model="nodeForm.code" /></el-form-item></el-col><el-col :span="14"><el-form-item label="名称"><el-input v-model="nodeForm.name" /></el-form-item></el-col></el-row>
        <el-form-item label="分类"><el-input v-model="nodeForm.category" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="nodeForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="难度"><el-slider v-model="nodeForm.difficulty" :min="1" :max="5" show-stops /></el-form-item>
        <el-row :gutter="14"><el-col :span="8"><el-form-item label="初始 P₀"><el-input-number v-model="nodeForm.pInit" :min="0" :max="1" :step="0.05" /></el-form-item></el-col><el-col :span="8"><el-form-item label="学习 T"><el-input-number v-model="nodeForm.pLearn" :min="0" :max="1" :step="0.05" /></el-form-item></el-col><el-col :span="8"><el-form-item label="失误 S"><el-input-number v-model="nodeForm.pSlip" :min="0" :max="1" :step="0.05" /></el-form-item></el-col></el-row>
        <el-form-item label="启用"><el-switch v-model="nodeForm.active" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="nodeDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveNode">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="edgeDialog" title="新增先修关系" width="480px">
      <el-form :model="edgeForm" label-width="92px"><el-form-item label="先修知识"><el-select v-model="edgeForm.fromNodeId" filterable style="width: 100%"><el-option v-for="n in graph.nodes" :key="n.id" :label="n.name" :value="n.id" /></el-select></el-form-item><el-form-item label="目标知识"><el-select v-model="edgeForm.toNodeId" filterable style="width: 100%"><el-option v-for="n in graph.nodes" :key="n.id" :label="n.name" :value="n.id" /></el-select></el-form-item><el-form-item label="关系权重"><el-input-number v-model="edgeForm.weight" :min="0" :max="1" :step="0.1" /></el-form-item></el-form>
      <template #footer><el-button @click="edgeDialog = false">取消</el-button><el-button type="primary" @click="saveEdge">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="bindingDialog" title="关联学习资源" width="520px">
      <el-form :model="bindingForm" label-width="92px"><el-form-item label="资源类型"><el-radio-group v-model="bindingForm.resourceType"><el-radio-button value="CONTENT">课程</el-radio-button><el-radio-button value="QUESTION">试题</el-radio-button></el-radio-group></el-form-item><el-form-item label="资源"><el-select v-model="bindingForm.resourceId" filterable style="width: 100%"><el-option v-for="r in bindingResources" :key="r.id" :label="r.title || r.stem" :value="r.id" /></el-select></el-form-item><el-form-item label="知识点"><el-select v-model="bindingForm.nodeId" filterable style="width: 100%"><el-option v-for="n in graph.nodes" :key="n.id" :label="n.name" :value="n.id" /></el-select></el-form-item><el-form-item label="难度"><el-slider v-model="bindingForm.difficulty" :min="1" :max="5" show-stops /></el-form-item></el-form>
      <template #footer><el-button @click="bindingDialog = false">取消</el-button><el-button type="primary" @click="saveBinding">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import * as echarts from 'echarts';
import type { LearningPathResultDto } from '@ai-party-school/shared';
import { contentApi, knowledgeApi, learningPathApi, questionApi, userApi } from '@/api';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'ADMIN');
const graph = reactive<any>({ version: 1, nodes: [], edges: [] });
const loading = ref(false);
const saving = ref(false);
const chartEl = ref<HTMLElement>();
let chart: echarts.ECharts | undefined;
const users = ref<any[]>([]);
const contents = ref<any[]>([]);
const questions = ref<any[]>([]);
const selectedUserId = ref<number>();
const userPath = ref<LearningPathResultDto>();
const pathLoading = ref(false);
const contentBindingCount = computed(() => graph.nodes.reduce((sum: number, node: any) => sum + node.contents.length, 0));
const averageMastery = computed(() => userPath.value?.masterySummary.length ? Math.round(userPath.value.masterySummary.reduce((sum, state) => sum + state.mastery, 0) / userPath.value.masterySummary.length * 100) : 0);

const nodeDialog = ref(false);
const edgeDialog = ref(false);
const bindingDialog = ref(false);
const editingNodeId = ref<number>();
const nodeForm = reactive<any>({ code: '', name: '', description: '', category: '理论基础', difficulty: 1, pInit: 0.2, pLearn: 0.15, pSlip: 0.1, active: true });
const edgeForm = reactive<any>({ fromNodeId: undefined, toNodeId: undefined, weight: 1 });
const bindingForm = reactive<any>({ resourceType: 'CONTENT', resourceId: undefined, nodeId: undefined, weight: 1, difficulty: 1 });
const bindingResources = computed(() => bindingForm.resourceType === 'CONTENT' ? contents.value : questions.value);

const loadAll = async () => {
  loading.value = true;
  try {
    const [g, u, c, q]: any[] = await Promise.all([
      knowledgeApi.graph(), userApi.list({ page: 1, pageSize: 100, role: 'MEMBER' }),
      contentApi.list({ page: 1, pageSize: 100 }), questionApi.list({ page: 1, pageSize: 100 }),
    ]);
    Object.assign(graph, g); users.value = u.list; contents.value = c.list; questions.value = q.list;
    await nextTick(); renderGraph();
  } finally { loading.value = false; }
};

const renderGraph = () => {
  if (!chartEl.value || !graph.nodes.length) return;
  chart ??= echarts.init(chartEl.value);
  const categories = [...new Set(graph.nodes.map((n: any) => n.category))];
  chart.setOption({
    tooltip: { formatter: (p: any) => p.dataType === 'node' ? `${p.data.name}<br/>难度 ${p.data.difficulty}/5` : '先修关系' },
    legend: [{ data: categories, bottom: 4 }],
    series: [{ type: 'graph', layout: 'force', roam: true, draggable: true, symbolSize: (v: any, p: any) => 32 + p.data.difficulty * 5,
      force: { repulsion: 260, edgeLength: [90, 160] }, edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 8,
      label: { show: true, color: '#2b211d', fontFamily: 'Songti SC', fontWeight: 600 },
      lineStyle: { color: '#b78d54', width: 1.5, curveness: 0.08 },
      categories: categories.map((name) => ({ name })),
      data: graph.nodes.map((n: any) => ({ id: String(n.id), name: n.name, difficulty: n.difficulty, category: categories.indexOf(n.category), itemStyle: { color: n.active ? '#8b1a1a' : '#a9a29a', borderColor: '#f2dfb4', borderWidth: 3 } })),
      links: graph.edges.map((e: any) => ({ source: String(e.fromNodeId), target: String(e.toNodeId) })),
    }],
  }, true);
};

const openNode = (row?: any) => { editingNodeId.value = row?.id; Object.assign(nodeForm, row ? { ...row } : { code: '', name: '', description: '', category: '理论基础', difficulty: 1, pInit: 0.2, pLearn: 0.15, pSlip: 0.1, active: true }); nodeDialog.value = true; };
const saveNode = async () => { if (!nodeForm.code || !nodeForm.name || !nodeForm.category) return ElMessage.warning('请填写编码、名称和分类'); saving.value = true; try { editingNodeId.value ? await knowledgeApi.updateNode(editingNodeId.value, nodeForm) : await knowledgeApi.createNode(nodeForm); ElMessage.success('知识点已保存'); nodeDialog.value = false; await loadAll(); } finally { saving.value = false; } };
const removeNode = async (row: any) => { await ElMessageBox.confirm(`删除知识点“${row.name}”及其关联关系？`, '删除确认', { type: 'warning' }); await knowledgeApi.removeNode(row.id); ElMessage.success('已删除'); await loadAll(); };
const saveEdge = async () => { if (!edgeForm.fromNodeId || !edgeForm.toNodeId) return ElMessage.warning('请选择两个知识点'); await knowledgeApi.createEdge(edgeForm); edgeDialog.value = false; ElMessage.success('先修关系已保存'); await loadAll(); };
const removeEdge = async (id: number) => { await knowledgeApi.removeEdge(id); await loadAll(); };
const saveBinding = async () => { if (!bindingForm.resourceId || !bindingForm.nodeId) return ElMessage.warning('请选择资源和知识点'); await knowledgeApi.createBinding(bindingForm); bindingDialog.value = false; ElMessage.success('资源关联已保存'); await loadAll(); };
const removeBinding = async (type: string, resourceId: number, nodeId: number) => { await knowledgeApi.removeBinding(type, resourceId, nodeId); await loadAll(); };
const loadUserPath = async () => { if (!selectedUserId.value) return; pathLoading.value = true; try { userPath.value = await learningPathApi.user(selectedUserId.value); } finally { pathLoading.value = false; } };
const nodeName = (id: number) => graph.nodes.find((node: any) => node.id === id)?.name ?? id;
const truncate = (text: string, length: number) => text?.length > length ? `${text.slice(0, length)}…` : text;
const resize = () => chart?.resize();
onMounted(() => { loadAll(); window.addEventListener('resize', resize); });
onBeforeUnmount(() => { window.removeEventListener('resize', resize); chart?.dispose(); });
</script>

<style scoped>
.knowledge-page{padding:26px 28px 40px;background:radial-gradient(circle at 85% 0,rgba(201,169,97,.12),transparent 28%);min-height:100%}.atlas-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px}.eyebrow{font-size:10px;letter-spacing:2.4px;color:#a8893e}.atlas-head h1{margin:7px 0 4px;font:700 30px/1.2 var(--ps-font-serif);letter-spacing:2px;color:#2b211d}.atlas-head p{margin:0;color:var(--ps-muted)}.head-actions{display:flex;gap:8px}.metric-strip{display:grid;grid-template-columns:repeat(4,1fr);background:#741414;color:#fff;border-radius:14px;margin-bottom:18px;overflow:hidden;box-shadow:0 12px 30px rgba(94,15,15,.18)}.metric-strip div{padding:18px 22px;border-right:1px solid rgba(255,255,255,.12)}.metric-strip strong{display:block;font:700 24px var(--ps-font-num);color:#f2d798}.metric-strip span{font-size:12px;opacity:.72}.atlas-grid{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(300px,.8fr);gap:18px;margin-bottom:18px}.graph-card,.preview-card,.table-card{border:1px solid #eadfce;border-radius:14px}.section-head{display:flex;justify-content:space-between;align-items:center}.section-head b{font:600 17px var(--ps-font-serif);color:#2b211d}.section-head small{display:block;margin-top:3px;color:#998e80}.graph-canvas{height:430px}.path-preview{margin-top:18px}.mastery-line{display:flex;justify-content:space-between;padding:13px 14px;background:#fbf2e6;border-left:3px solid #8b1a1a;margin-bottom:12px}.preview-step{display:flex;gap:11px;padding:12px 0;border-bottom:1px dashed #e6d9c6}.preview-step div{min-width:0}.preview-step b,.preview-step small{display:block}.preview-step small{margin-top:4px;color:#998e80}.step-rank{font:700 18px Georgia;color:#b98f4f}.muted{font-size:12px;color:#9a9186;margin-top:3px}.binding-tag{margin:2px 5px 2px 0}.tag-close{margin-left:5px;cursor:pointer}.edge-list{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:16px 4px 2px;border-top:1px solid #eee4d7;margin-top:14px}.edge-label{font-size:12px;color:#8b1a1a;font-weight:600;margin-right:4px}code{font-size:11px;color:#6e4b35;background:#f8f2e9;padding:4px 6px;border-radius:4px}@media(max-width:1100px){.atlas-grid{grid-template-columns:1fr}.metric-strip{grid-template-columns:repeat(2,1fr)}}
</style>
