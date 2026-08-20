<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>测验管理</span>
          <el-button type="primary" @click="openCreate">发布测验</el-button>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="试卷" min-width="180"><template #default="{ row }">{{ row.paper.title }}</template></el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }"><el-tag :type="row.type === 'EXAM' ? 'danger' : ''">{{ row.type === 'EXAM' ? '正式考试' : '练习测验' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="目标支部" width="140"><template #default="{ row }">{{ row.org?.name }}</template></el-table-column>
        <el-table-column label="参与对象" width="140">
          <template #default="{ row }">
            <span v-if="!row.participantUserIds || row.participantUserIds.length === 0">全部成员</span>
            <span v-else>{{ row.participantUserIds.length }} 人</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="180"><template #default="{ row }">{{ formatDate(row.startTime) }}</template></el-table-column>
        <el-table-column label="结束时间" width="180"><template #default="{ row }">{{ formatDate(row.endTime) }}</template></el-table-column>
        <el-table-column prop="duration" label="时长(分)" width="100" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="560px" append-to-body>
      <el-form :model="dialog.form" label-width="100px">
        <el-form-item label="试卷">
          <el-select v-model="dialog.form.paperId" style="width: 100%">
            <el-option v-for="p in papers" :key="p.id" :value="p.id" :label="`${p.title} (总分${p.totalScore})`" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="dialog.form.type">
            <el-radio value="PRACTICE">练习测验</el-radio>
            <el-radio value="EXAM">正式考试</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="目标支部">
          <el-select v-model="dialog.form.orgId" style="width: 100%" :disabled="!isAdmin">
            <el-option v-for="o in orgs" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
          <span v-if="!isAdmin" style="color: #909399; font-size: 12px">支部书记仅可对本支部发布</span>
        </el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="dialog.form.startTime" type="datetime" style="width: 100%" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="dialog.form.endTime" type="datetime" style="width: 100%" /></el-form-item>
        <el-form-item label="时长(分钟)">
          <span style="font-weight: 600">{{ computedDuration }} 分钟</span>
          <span style="color: #909399; font-size: 12px; margin-left: 8px">
            自动取自试卷做题时长（{{ selectedPaperDuration }} 分钟）{{ dialog.form.type === 'PRACTICE' ? '，练习测验 ×2' : '，正式考试不变' }}
          </span>
        </el-form-item>
        <el-form-item label="参与对象">
          <el-radio-group v-model="dialog.form.participantMode" style="margin-bottom: 8px">
            <el-radio value="all">全部成员</el-radio>
            <el-radio value="selected">指定人员</el-radio>
          </el-radio-group>
          <el-select
            v-if="dialog.form.participantMode === 'selected'"
            v-model="dialog.form.participantUserIds"
            multiple
            filterable
            placeholder="选择参与人员"
            style="width: 100%"
          >
            <el-option
              v-for="u in orgMembers"
              :key="u.id"
              :value="u.id"
              :label="`${u.name} (${u.username})`"
            />
          </el-select>
          <span v-else style="color: #909399; font-size: 12px">该支部所有党员均可见此测验</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue';
import { quizApi, paperApi, orgApi, userApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import type { OrgNode } from '@ai-party-school/shared';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'ADMIN');

const loading = ref(false);
const list = ref<any[]>([]);
const papers = ref<any[]>([]);
const orgs = ref<OrgNode[]>([]);
const orgMembers = ref<any[]>([]);

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: {
    paperId: 0,
    type: 'PRACTICE',
    orgId: 0,
    startTime: '',
    endTime: '',
    duration: 30,
    participantMode: 'all' as 'all' | 'selected',
    participantUserIds: [] as number[],
  },
});

// 选中试卷的做题时长
const selectedPaperDuration = computed(() => {
  const p = papers.value.find((x) => x.id === dialog.form.paperId);
  return p?.duration ?? 0;
});

// 测验时长：练习 ×2，正式考试不变（前端只读展示，最终以后端派生为准）
const computedDuration = computed(() =>
  dialog.form.type === 'PRACTICE' ? selectedPaperDuration.value * 2 : selectedPaperDuration.value,
);

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await quizApi.list({ page: 1, pageSize: 100 });
    list.value = res.list;
  } finally {
    loading.value = false;
  }
};

const loadPapers = async () => {
  const res: any = await paperApi.list({ page: 1, pageSize: 100 });
  papers.value = res.list;
};

const loadOrgs = async () => {
  const tree = await orgApi.tree();
  const flat: OrgNode[] = [];
  const walk = (nodes: OrgNode[]) => nodes.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
  walk(tree);
  orgs.value = flat.filter((o) => o.level === 2);
};

/** 加载指定支部的党员列表（用于参与对象选择） */
const loadOrgMembers = async (orgId: number) => {
  if (!orgId) {
    orgMembers.value = [];
    return;
  }
  const res: any = await userApi.list({ page: 1, pageSize: 100, orgId, role: 'MEMBER' });
  orgMembers.value = res.list;
};

watch(() => dialog.form.orgId, async (orgId) => {
  if (orgId && dialog.visible) {
    try {
      await loadOrgMembers(orgId);
    } catch {
      orgMembers.value = [];
    }
    dialog.form.participantUserIds = [];
  }
});

const openCreate = () => {
  dialog.isEdit = false;
  dialog.title = '发布测验';
  const initOrgId = isAdmin.value ? (orgs.value[0]?.id ?? 0) : (auth.user?.orgId ?? 0);
  dialog.form = {
    paperId: papers.value[0]?.id ?? 0,
    type: 'PRACTICE',
    orgId: initOrgId,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    duration: 30,
    participantMode: 'all',
    participantUserIds: [],
  };
  dialog.visible = true;
  if (initOrgId) loadOrgMembers(initOrgId);
};

const openEdit = (row: any) => {
  dialog.isEdit = true;
  dialog.editId = row.id;
  dialog.title = '编辑测验';
  const ids: number[] = row.participantUserIds ?? [];
  dialog.form = {
    paperId: row.paperId,
    type: row.type,
    orgId: row.orgId,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
    participantMode: ids.length === 0 ? 'all' : 'selected',
    participantUserIds: ids,
  };
  dialog.visible = true;
  loadOrgMembers(row.orgId);
};

const submit = async () => {
  if (!dialog.form.paperId || !dialog.form.orgId) {
    ElMessage.warning('请填写完整');
    return;
  }
  const payload: any = {
    paperId: dialog.form.paperId,
    type: dialog.form.type,
    orgId: dialog.form.orgId,
    startTime: dialog.form.startTime,
    endTime: dialog.form.endTime,
    duration: computedDuration.value,
    participantUserIds: dialog.form.participantMode === 'all' ? [] : dialog.form.participantUserIds,
  };
  if (dialog.isEdit) {
    await quizApi.update(dialog.editId, payload);
  } else {
    await quizApi.create(payload);
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await loadList();
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除该测验吗？`, '提示', { type: 'warning' }).then(async () => {
    await quizApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

const formatDate = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(async () => {
  await Promise.all([loadPapers(), loadOrgs()]);
  await loadList();
});
</script>
