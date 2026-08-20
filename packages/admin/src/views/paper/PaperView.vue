<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>试卷管理</span>
          <div><el-button type="warning" plain @click="openAdaptive">薄弱点智能组卷</el-button><el-button type="primary" @click="openCreate">创建试卷</el-button></div>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="试卷名称" min-width="200" />
        <el-table-column prop="totalScore" label="总分" width="80" />
        <el-table-column prop="passScore" label="及格分" width="80" />
        <el-table-column label="题数" width="80"><template #default="{ row }">{{ row.questions?.length ?? 0 }}</template></el-table-column>
        <el-table-column prop="duration" label="时长(分)" width="90" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetail(row)">查看</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="900px" top="5vh" append-to-body>
      <el-form :model="dialog.form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="dialog.form.title" /></el-form-item>
        <el-form-item label="及格分"><el-input-number v-model="dialog.form.passScore" :min="0" /></el-form-item>
        <el-form-item label="做题时长">
          <div style="display: flex; gap: 8px; align-items: center">
            <el-input-number v-model="dialog.form.duration" :min="0" :step="2" @change="onDurationInput" /> 分钟
            <el-button size="small" @click="fillRecommendedDuration">用推荐值（{{ recommendedMinutes }} 分钟）</el-button>
          </div>
        </el-form-item>
        <el-form-item label="题目">
          <div style="display: flex; gap: 12px; width: 100%">
            <div style="flex: 1">
              <div style="margin-bottom: 8px; font-weight: bold">题库（点击添加）</div>
              <el-table :data="questionList" border size="small" height="400" @row-click="addQuestion">
                <el-table-column prop="id" label="ID" width="50" />
                <el-table-column label="题型" width="60"><template #default="{ row }">{{ typeLabel(row.type) }}</template></el-table-column>
                <el-table-column prop="stem" label="题干" show-overflow-tooltip />
                <el-table-column prop="category" label="分类" width="100" />
              </el-table>
            </div>
            <div style="flex: 1">
              <div style="margin-bottom: 8px; font-weight: bold">已选题目（设置分值）</div>
              <el-table :data="dialog.form.questions" border size="small" height="400">
                <el-table-column label="题干" min-width="200"><template #default="{ row }">{{ questionMap.get(row.questionId)?.stem }}</template></el-table-column>
                <el-table-column label="分值" width="100">
                  <template #default="{ row }"><el-input-number v-model="row.score" :min="1" size="small" /></template>
                </el-table-column>
                <el-table-column label="操作" width="80">
                  <template #default="{ $index }"><el-button size="small" type="danger" @click="dialog.form.questions.splice($index, 1)">移除</el-button></template>
                </el-table-column>
              </el-table>
              <div style="margin-top: 8px; text-align: right">总分：{{ totalScore }}</div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adaptive.visible" title="薄弱知识点智能组卷" width="500px" append-to-body>
      <el-alert title="依据党员BKT掌握度，从已审核且已关联知识点的题库中组卷；不会直接使用未经审核的AI生成题。" type="info" :closable="false" style="margin-bottom:16px" />
      <el-form :model="adaptive.form" label-width="90px">
        <el-form-item label="目标党员"><el-select v-model="adaptive.form.userId" filterable style="width:100%"><el-option v-for="u in members" :key="u.id" :label="`${u.name} · ${u.org?.name || u.orgName || ''}`" :value="u.id" /></el-select></el-form-item>
        <el-form-item label="试卷名称"><el-input v-model="adaptive.form.title" placeholder="留空则自动生成" /></el-form-item>
        <el-form-item label="题目数量"><el-input-number v-model="adaptive.form.questionCount" :min="5" :max="50" /></el-form-item>
        <el-form-item label="及格分"><el-input-number v-model="adaptive.form.passScore" :min="0" :max="100" /></el-form-item>
        <el-form-item label="时长"><el-input-number v-model="adaptive.form.duration" :min="5" :max="180" /> 分钟</el-form-item>
      </el-form>
      <template #footer><el-button @click="adaptive.visible=false">取消</el-button><el-button type="primary" :loading="adaptive.loading" @click="generateAdaptive">生成试卷</el-button></template>
    </el-dialog>

    <el-dialog v-model="detailDialog.visible" title="试卷详情" width="760px" top="5vh" append-to-body>
      <div v-if="detailDialog.data">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="试卷名称" :span="3">{{ detailDialog.data.title }}</el-descriptions-item>
          <el-descriptions-item label="总分">{{ detailDialog.data.totalScore }}</el-descriptions-item>
          <el-descriptions-item label="及格分">{{ detailDialog.data.passScore }}</el-descriptions-item>
          <el-descriptions-item label="题数">{{ detailDialog.data.questions.length }}</el-descriptions-item>
          <el-descriptions-item label="做题时长">{{ detailDialog.data.duration }} 分钟</el-descriptions-item>
          <el-descriptions-item label="推荐时长">{{ recommendedDuration(detailDialog.data) }} 分钟</el-descriptions-item>
          <el-descriptions-item label="推荐标准" :span="2">每题 2 分钟</el-descriptions-item>
        </el-descriptions>

        <div class="paper-summary">
          <el-tag type="info">共 {{ detailDialog.data.questions.length }} 题</el-tag>
          <el-tag v-for="item in typeCount" :key="item.type" :type="tagType(item.type)">
            {{ typeLabel(item.type) }} {{ item.count }} 题
          </el-tag>
        </div>

        <div v-for="(q, i) in detailDialog.data.questions" :key="q.questionId" class="q-card">
          <div class="q-head">
            <span class="q-no">{{ i + 1 }}</span>
            <el-tag :type="tagType(q.question.type)" size="small">{{ typeLabel(q.question.type) }}</el-tag>
            <span class="q-stem">{{ q.question.stem }}</span>
            <el-tag size="small" type="warning" effect="plain" class="q-score">{{ q.score }} 分</el-tag>
          </div>
          <div v-if="q.question.category" class="q-cat">分类：{{ q.question.category }}</div>
          <ul class="q-options">
            <li
              v-for="(opt, idx) in optList(q.question)"
              :key="idx"
              :class="{ correct: isCorrect(opt, q.question.answer) }"
            >
              <span class="opt-text">{{ opt }}</span>
              <span v-if="isCorrect(opt, q.question.answer)" class="opt-check">✓</span>
            </li>
          </ul>
          <div class="q-answer">正确答案：<strong>{{ answerText(q.question) }}</strong></div>
          <div v-if="q.question.analysis" class="q-analysis">解析：{{ q.question.analysis }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue';
import { paperApi, questionApi, userApi } from '@/api';

const loading = ref(false);
const list = ref<any[]>([]);
const questionList = ref<any[]>([]);
const questionMap = ref(new Map<number, any>());
const members = ref<any[]>([]);
const adaptive = reactive({ visible: false, loading: false, form: { userId: undefined as number | undefined, title: '', questionCount: 10, passScore: 60, duration: 20 } });

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: { title: '', passScore: 60, duration: 0, questions: [] as Array<{ questionId: number; score: number }> },
});

const detailDialog = reactive({ visible: false, data: null as any });

const totalScore = computed(() => dialog.form.questions.reduce((s, q) => s + q.score, 0));

// 推荐时长 = 题数 × 2 分钟
const recommendedMinutes = computed(() => dialog.form.questions.length * 2);
const recommendedDuration = (data: any) => (data?.questions?.length ?? 0) * 2;
// durationLocked: 用户手动改过后不再被推荐值覆盖
const durationLocked = ref(false);
const fillRecommendedDuration = () => {
  durationLocked.value = false;
  dialog.form.duration = recommendedMinutes.value;
};
// 题目变动时，若未手动改过时长大，自动同步为推荐值
watch(
  () => dialog.form.questions.length,
  () => {
    if (!durationLocked.value) dialog.form.duration = recommendedMinutes.value;
  },
);
const onDurationInput = () => { durationLocked.value = true; };

// 试卷详情：按题型统计
const typeCount = computed<Array<{ type: string; count: number }>>(() => {
  const data = detailDialog.data;
  if (!data) return [];
  const map: Record<string, number> = {};
  for (const q of data.questions) {
    const t = q.question?.type;
    if (t) map[t] = (map[t] ?? 0) + 1;
  }
  return Object.entries(map).map(([type, count]) => ({ type, count }));
});

// options 后端可能返回 JSON 字符串，统一解析为数组
const optList = (q: any): string[] => {
  const o = q?.options;
  if (Array.isArray(o)) return o;
  try {
    const parsed = JSON.parse(o);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// 提取选项前缀字母（如 "A. xxx" -> "A"）
const optionLetter = (opt: string) => opt.match(/^([A-Za-z])\./)?.[1]?.toUpperCase() ?? '';

// 该选项是否为正确答案
const isCorrect = (opt: string, answer: string) => {
  const letter = optionLetter(opt);
  return letter !== '' && answer.toUpperCase().includes(letter);
};

// 正确答案的可读文本（取正确选项的完整内容）
const answerText = (q: any) => {
  const opts = optList(q);
  if (!opts.length) return q?.answer ?? '';
  const correct = opts.filter((opt: string) => isCorrect(opt, q.answer));
  return correct.length ? correct.join('　') : q.answer;
};

// 题型对应的标签颜色
const tagType = (t: string) =>
  ({ SINGLE: '', MULTIPLE: 'warning', JUDGE: 'success' } as Record<string, any>)[t] ?? 'info';

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await paperApi.list({ page: 1, pageSize: 100 });
    list.value = res.list;
  } finally {
    loading.value = false;
  }
};

const loadQuestions = async () => {
  const res: any = await questionApi.list({ page: 1, pageSize: 100 });
  questionList.value = res.list;
  questionMap.value = new Map(res.list.map((q: any) => [q.id, q]));
};

const addQuestion = (row: any) => {
  if (dialog.form.questions.find((q) => q.questionId === row.id)) return;
  dialog.form.questions.push({ questionId: row.id, score: 10 });
};

const openCreate = () => {
  dialog.isEdit = false;
  dialog.title = '创建试卷';
  durationLocked.value = false;
  dialog.form = { title: '', passScore: 60, duration: 0, questions: [] };
  dialog.visible = true;
};

const openEdit = async (row: any) => {
  dialog.isEdit = true;
  dialog.editId = row.id;
  dialog.title = '编辑试卷';
  const detail: any = await paperApi.detail(row.id);
  durationLocked.value = true;
  dialog.form = {
    title: detail.title,
    passScore: detail.passScore,
    duration: detail.duration ?? 0,
    questions: detail.questions.map((q: any) => ({ questionId: q.questionId, score: q.score })),
  };
  dialog.visible = true;
};

const viewDetail = async (row: any) => {
  detailDialog.data = await paperApi.detail(row.id);
  detailDialog.visible = true;
};

const submit = async () => {
  if (!dialog.form.title || dialog.form.questions.length === 0) {
    ElMessage.warning('请填写名称并选择题目');
    return;
  }
  if (!dialog.form.duration) dialog.form.duration = recommendedMinutes.value;
  if (dialog.isEdit) {
    await paperApi.update(dialog.editId, dialog.form);
  } else {
    await paperApi.create(dialog.form);
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await loadList();
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除试卷「${row.title}」吗？`, '提示', { type: 'warning' }).then(async () => {
    await paperApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

const openAdaptive = async () => {
  if (!members.value.length) {
    const res: any = await userApi.list({ page: 1, pageSize: 100, role: 'MEMBER' });
    members.value = res.list;
  }
  adaptive.visible = true;
};

const generateAdaptive = async () => {
  if (!adaptive.form.userId) return ElMessage.warning('请选择目标党员');
  adaptive.loading = true;
  try {
    const result: any = await paperApi.generateAdaptive(adaptive.form);
    ElMessage.success(`已生成试卷，覆盖 ${result.coverage} 个薄弱知识点`);
    adaptive.visible = false;
    await loadList();
  } finally { adaptive.loading = false; }
};

const typeLabel = (t: string) => ({ SINGLE: '单选', MULTIPLE: '多选', JUDGE: '判断' } as any)[t] ?? t;

onMounted(async () => {
  await loadQuestions();
  await loadList();
});
</script>

<style scoped>
.paper-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 4px;
}
.q-card {
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.q-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.q-no {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 13px;
}
.q-stem {
  flex: 1;
  font-weight: 600;
  color: #303133;
}
.q-score {
  margin-left: auto;
}
.q-cat {
  margin: 6px 0;
  color: #909399;
  font-size: 12px;
}
.q-options {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
.q-options li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  margin-bottom: 4px;
  background: #f5f7fa;
  border-radius: 4px;
}
.q-options li.correct {
  background: #f0f9eb;
  color: #67c23a;
  font-weight: 600;
}
.opt-check {
  margin-left: 8px;
  font-weight: 700;
}
.q-answer {
  margin-top: 8px;
  color: #303133;
}
.q-analysis {
  margin-top: 6px;
  padding: 6px 10px;
  color: #909399;
  font-size: 13px;
  background: #fdf6ec;
  border-radius: 4px;
}
</style>
