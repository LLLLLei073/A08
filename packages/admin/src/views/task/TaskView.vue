<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>学习任务</span>
          <el-button type="primary" @click="openCreate">发布任务</el-button>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="title" label="任务标题" min-width="180" />
        <el-table-column prop="orgName" label="所属支部" width="140" />
        <el-table-column label="参与对象" width="180">
          <template #default="{ row }">
            <span v-if="!row.participantUserIds || row.participantUserIds.length === 0">全部成员</span>
            <span v-else>{{ row.participantUserIds.length }} 人</span>
          </template>
        </el-table-column>
        <el-table-column label="内容数" width="80"><template #default="{ row }">{{ row.contents.length }}</template></el-table-column>
        <el-table-column label="截止时间" width="180"><template #default="{ row }">{{ formatDate(row.deadline) }}</template></el-table-column>
        <el-table-column label="包含内容" min-width="280">
          <template #default="{ row }">
            <el-tag v-for="c in row.contents" :key="c.contentId" size="small" style="margin: 2px">{{ c.title }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="640px" append-to-body>
      <el-form :model="dialog.form" label-width="100px">
        <el-form-item label="任务标题"><el-input v-model="dialog.form.title" /></el-form-item>
        <el-form-item label="所属支部">
          <el-select v-model="dialog.form.orgId" style="width: 100%" :disabled="!isAdmin">
            <el-option v-for="o in orgs" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
          <span v-if="!isAdmin" style="color: #909399; font-size: 12px">支部书记仅可对本支部发布</span>
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker v-model="dialog.form.deadline" type="datetime" placeholder="选择截止时间" style="width: 100%" />
        </el-form-item>
        <el-form-item label="学习内容">
          <el-select v-model="dialog.form.contentIds" multiple filterable placeholder="选择内容" style="width: 100%">
            <el-option v-for="c in contents" :key="c.id" :value="c.id" :label="`${c.title} (${c.category})`" />
          </el-select>
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
          <span v-else style="color: #909399; font-size: 12px">该支部所有党员均可见此任务</span>
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
import { taskApi, orgApi, contentApi, userApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import type { OrgNode } from '@ai-party-school/shared';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'ADMIN');

const loading = ref(false);
const list = ref<any[]>([]);
const orgs = ref<OrgNode[]>([]);
const contents = ref<any[]>([]);
const orgMembers = ref<any[]>([]);

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: {
    title: '',
    orgId: 0,
    deadline: '',
    contentIds: [] as number[],
    participantMode: 'all' as 'all' | 'selected',
    participantUserIds: [] as number[],
  },
});

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await taskApi.list({ page: 1, pageSize: 100 });
    list.value = res.list;
  } finally {
    loading.value = false;
  }
};

const loadOrgs = async () => {
  const tree = await orgApi.tree();
  const flat: OrgNode[] = [];
  const walk = (nodes: OrgNode[]) => nodes.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
  walk(tree);
  orgs.value = flat.filter((o) => o.level === 2);
};

const loadContents = async () => {
  const res: any = await contentApi.list({ page: 1, pageSize: 100 });
  contents.value = res.list;
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

// 切换支部时重新加载党员
watch(() => dialog.form.orgId, async (orgId) => {
  if (orgId && dialog.visible) {
    try {
      await loadOrgMembers(orgId);
    } catch {
      orgMembers.value = [];
    }
    // 切换支部清空已选参与人员
    dialog.form.participantUserIds = [];
  }
});

const openCreate = () => {
  dialog.isEdit = false;
  dialog.title = '发布学习任务';
  // SECRETARY 强制为本支部
  const initOrgId = isAdmin.value ? (orgs.value[0]?.id ?? 0) : (auth.user?.orgId ?? 0);
  dialog.form = {
    title: '',
    orgId: initOrgId,
    deadline: '',
    contentIds: [],
    participantMode: 'all',
    participantUserIds: [],
  };
  dialog.visible = true;
  if (initOrgId) loadOrgMembers(initOrgId);
};

const openEdit = (row: any) => {
  dialog.isEdit = true;
  dialog.editId = row.id;
  dialog.title = '编辑学习任务';
  const ids: number[] = row.participantUserIds ?? [];
  dialog.form = {
    title: row.title,
    orgId: row.orgId,
    deadline: row.deadline,
    contentIds: row.contents.map((c: any) => c.contentId),
    participantMode: ids.length === 0 ? 'all' : 'selected',
    participantUserIds: ids,
  };
  dialog.visible = true;
  loadOrgMembers(row.orgId);
};

const submit = async () => {
  if (!dialog.form.title || !dialog.form.orgId || dialog.form.contentIds.length === 0) {
    ElMessage.warning('请填写完整');
    return;
  }
  const payload: any = {
    title: dialog.form.title,
    orgId: dialog.form.orgId,
    deadline: dialog.form.deadline,
    contentIds: dialog.form.contentIds,
    participantUserIds: dialog.form.participantMode === 'all' ? [] : dialog.form.participantUserIds,
  };
  if (dialog.isEdit) {
    await taskApi.update(dialog.editId, payload);
  } else {
    await taskApi.create(payload);
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await loadList();
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '提示', { type: 'warning' }).then(async () => {
    await taskApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

const formatDate = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(async () => {
  await loadOrgs();
  await loadContents();
  await loadList();
});
</script>
