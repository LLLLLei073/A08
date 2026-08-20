<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>组织架构</span>
          <el-button type="primary" @click="openCreate(null)">新增党委/总支</el-button>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col :span="10">
          <el-input v-model="filterText" placeholder="搜索组织" clearable style="margin-bottom: 12px" />
          <el-tree
            :data="tree"
            node-key="id"
            :props="{ children: 'children', label: 'name' }"
            :filter-node-method="filterNode"
            ref="treeRef"
            @node-click="onSelect"
            default-expand-all
          >
            <template #default="{ node, data }">
              <span class="tree-node">
                <span>{{ node.label }} <el-tag size="small" type="info">{{ data.userCount }} 人</el-tag></span>
              </span>
            </template>
          </el-tree>
        </el-col>
        <el-col :span="14">
          <el-card v-if="selected" shadow="never">
            <template #header>
              <div class="card-header">
                <span>{{ selected.name }} - 统计</span>
                <div>
                  <el-button size="small" @click="openCreate(selected)">新增子支部</el-button>
                  <el-button size="small" type="warning" @click="openEdit(selected)">编辑</el-button>
                  <el-button size="small" type="danger" @click="remove(selected)">删除</el-button>
                </div>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="组织名称">{{ selected.name }}</el-descriptions-item>
              <el-descriptions-item label="层级">{{ selected.level === 1 ? '党委/总支' : '支部' }}</el-descriptions-item>
              <el-descriptions-item label="党员数">{{ stats?.userCount ?? 0 }}</el-descriptions-item>
              <el-descriptions-item label="累计学习时长">{{ formatDuration(stats?.totalLearningSeconds) }}</el-descriptions-item>
              <el-descriptions-item label="任务完成率">{{ formatRate(stats?.taskCompletionRate) }}</el-descriptions-item>
              <el-descriptions-item label="测验平均分">{{ stats?.avgQuizScore ?? 0 }}</el-descriptions-item>
              <el-descriptions-item label="考试通过率">{{ formatRate(stats?.examPassRate) }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
          <el-empty v-else description="请选择左侧组织" />
        </el-col>
      </el-row>
    </el-card>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="420px" append-to-body>
      <el-form :model="dialog.form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="dialog.form.name" /></el-form-item>
        <el-form-item label="层级" v-if="!dialog.parent">
          <el-select v-model="dialog.form.level" style="width: 100%">
            <el-option :value="1" label="党委/总支" />
            <el-option :value="2" label="支部" />
          </el-select>
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
import { onMounted, reactive, ref, watch } from 'vue';
import { orgApi } from '@/api';
import type { OrgNode, OrgStats } from '@ai-party-school/shared';

const tree = ref<OrgNode[]>([]);
const treeRef = ref();
const filterText = ref('');
const selected = ref<OrgNode | null>(null);
const stats = ref<OrgStats | null>(null);

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  parent: null as OrgNode | null,
  form: { name: '', level: 1 },
});

const filterNode = (val: string, data: OrgNode) => (!val ? true : data.name.includes(val));
watch(filterText, (v) => treeRef.value?.filter(v));

const load = async () => {
  try {
    tree.value = await orgApi.tree();
  } catch {
    ElMessage.error('加载组织架构失败');
  }
};

const onSelect = async (node: OrgNode) => {
  selected.value = node;
  if (node.level === 2) {
    stats.value = await orgApi.stats(node.id);
  } else {
    stats.value = null;
  }
};

const openCreate = (parent: OrgNode | null) => {
  dialog.isEdit = false;
  dialog.editId = 0;
  dialog.parent = parent;
  dialog.form = { name: '', level: parent ? 2 : 1 };
  dialog.title = parent ? `在 ${parent.name} 下新增支部` : '新增党委/总支';
  dialog.visible = true;
};

const openEdit = (node: OrgNode) => {
  dialog.isEdit = true;
  dialog.editId = node.id;
  dialog.parent = null;
  dialog.form = { name: node.name, level: node.level };
  dialog.title = '编辑组织';
  dialog.visible = true;
};

const submit = async () => {
  if (!dialog.form.name) {
    ElMessage.warning('请输入名称');
    return;
  }
  if (dialog.isEdit) {
    await orgApi.update(dialog.editId, { name: dialog.form.name });
  } else {
    await orgApi.create({
      name: dialog.form.name,
      parentId: dialog.parent?.id ?? null,
      level: dialog.parent ? 2 : dialog.form.level,
    });
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await load();
};

const remove = (node: OrgNode) => {
  ElMessageBox.confirm(`确定删除组织「${node.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      await orgApi.remove(node.id);
      ElMessage.success('删除成功');
      selected.value = null;
      await load();
    })
    // 删除失败时错误提示已由 http 拦截器统一弹出，这里兜底避免未处理的 Promise rejection
    .catch(() => {});
};

const formatDuration = (s?: number) => {
  if (!s) return '0 分钟';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
};
const formatRate = (r?: number) => (r === undefined ? '-' : `${(r * 100).toFixed(1)}%`);

onMounted(load);
</script>

<style scoped>
.tree-node {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-right: 8px;
}
</style>
