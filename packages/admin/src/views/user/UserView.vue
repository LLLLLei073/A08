<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>人员管理</span>
          <div>
            <el-button v-if="isAdmin" @click="downloadTemplate('xlsx')">Excel 模板</el-button>
            <el-button v-if="isAdmin" @click="downloadTemplate('csv')">CSV 模板</el-button>
            <el-button v-if="isAdmin" type="success" @click="openImport">批量导入</el-button>
            <el-button type="primary" @click="openCreate">新增党员</el-button>
          </div>
        </div>
      </template>
      <el-form :inline="true" :model="filter" style="margin-bottom: 12px">
        <el-form-item label="姓名"><el-input v-model="filter.name" clearable placeholder="搜索姓名" /></el-form-item>
        <el-form-item label="支部" v-if="isAdmin">
          <el-select v-model="filter.orgId" clearable placeholder="全部支部" style="width: 180px">
            <el-option v-for="o in flatOrgs" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色" v-if="isAdmin">
          <el-select v-model="filter.role" clearable placeholder="全部角色" style="width: 140px">
            <el-option value="ADMIN" label="系统管理员" />
            <el-option value="SECRETARY" label="支部书记" />
            <el-option value="MEMBER" label="党员" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="loadList">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="orgName" label="所属支部" width="140" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="roleTag(row.role)">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canEdit(row)"
              size="small"
              @click="openEdit(row)"
            >编辑</el-button>
            <el-button
              v-if="canDelete(row)"
              size="small"
              type="danger"
              @click="remove(row)"
            >删除</el-button>
            <span v-if="!canEdit(row) && !canDelete(row)" style="color: #909399; font-size: 12px">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="filter.page"
        v-model:page-size="filter.pageSize"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 12px"
        @current-change="loadList"
      />
    </el-card>

    <el-dialog v-model="formDialog.visible" :title="formDialog.title" width="500px" append-to-body>
      <el-form :model="formDialog.form" label-width="100px">
        <el-form-item label="用户名"><el-input v-model="formDialog.form.username" :disabled="formDialog.isEdit" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="formDialog.form.name" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="formDialog.form.phone" /></el-form-item>
        <el-form-item label="所属支部">
          <el-select v-model="formDialog.form.orgId" style="width: 100%" :disabled="!isAdmin">
            <el-option v-for="o in flatOrgs" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色" v-if="isAdmin">
          <el-select v-model="formDialog.form.role" style="width: 100%">
            <el-option value="ADMIN" label="系统管理员" />
            <el-option value="SECRETARY" label="支部书记" />
            <el-option value="MEMBER" label="党员" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色" v-else>
          <el-tag>党员</el-tag>
          <span style="color: #909399; font-size: 12px; margin-left: 8px">支部书记仅可新增/编辑本支部党员</span>
        </el-form-item>
        <el-form-item label="密码" v-if="!formDialog.isEdit">
          <el-input v-model="formDialog.form.password" placeholder="留空则使用默认密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialog" title="批量导入党员" width="480px" append-to-body>
      <el-upload
        :show-file-list="true"
        :http-request="doImport"
        accept=".xlsx,.csv"
        drag
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">点击或拖拽 Excel / CSV 文件上传</div>
        <template #tip>
          <div class="el-upload__tip">
            支持 .xlsx 和 UTF-8 .csv，
            <el-link type="primary" @click.stop="downloadTemplate('xlsx')">下载 Excel 模板</el-link>
            或
            <el-link type="primary" @click.stop="downloadTemplate('csv')">CSV 模板</el-link>
          </div>
        </template>
      </el-upload>
      <div v-if="importResult" style="margin-top: 12px">
        <el-alert :title="`成功 ${importResult.filter((r) => r.success).length} 条，失败 ${importResult.filter((r) => !r.success).length} 条`" type="info" :closable="false" />
        <el-alert
          v-if="importResult.some((r) => r.success && r.initialPassword)"
          title="初始密码仅在本次结果中显示，请及时保存；用户首次登录后需修改密码。"
          type="warning"
          :closable="false"
          style="margin-top: 8px"
        />
        <el-table :data="importResult" size="small" max-height="300" style="margin-top: 8px">
          <el-table-column prop="rowNumber" label="行" width="55" />
          <el-table-column prop="username" label="用户名" min-width="110" />
          <el-table-column label="结果" width="70">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="initialPassword" label="初始密码" min-width="130" />
          <el-table-column prop="error" label="失败原因" min-width="150" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import { userApi, orgApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import type { OrgNode } from '@ai-party-school/shared';

const auth = useAuthStore();
const isAdmin = computed(() => auth.role === 'ADMIN');

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const tree = ref<OrgNode[]>([]);

const flatOrgs = computed(() => {
  const flat: OrgNode[] = [];
  const walk = (nodes: OrgNode[]) => {
    nodes.forEach((n) => {
      flat.push(n);
      if (n.children) walk(n.children);
    });
  };
  walk(tree.value);
  return flat;
});

const filter = reactive({ page: 1, pageSize: 20, name: '', orgId: undefined as number | undefined, role: '' });

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await userApi.list(filter);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
};

const loadOrgs = async () => {
  tree.value = await orgApi.tree();
};

const formDialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: { username: '', name: '', phone: '', orgId: 0, role: 'MEMBER', password: '' },
});

const openCreate = () => {
  formDialog.isEdit = false;
  formDialog.title = '新增党员';
  // SECRETARY 创建时强制 orgId 为自己支部、role 为 MEMBER
  const initOrgId = isAdmin.value
    ? (flatOrgs.value.find((o) => o.level === 2)?.id ?? flatOrgs.value[0]?.id ?? 0)
    : (auth.user?.orgId ?? 0);
  formDialog.form = {
    username: '',
    name: '',
    phone: '',
    orgId: initOrgId,
    role: isAdmin.value ? 'MEMBER' : 'MEMBER',
    password: '',
  };
  formDialog.visible = true;
};

const openEdit = (row: any) => {
  formDialog.isEdit = true;
  formDialog.title = '编辑党员';
  formDialog.editId = row.id;
  formDialog.form = { username: row.username, name: row.name, phone: row.phone ?? '', orgId: row.orgId, role: row.role, password: '' };
  formDialog.visible = true;
};

/**
 * 是否可编辑：
 * - ADMIN：可编辑所有人
 * - SECRETARY：仅可编辑本支部 MEMBER
 */
const canEdit = (row: any) => {
  if (isAdmin.value) return true;
  if (auth.role !== 'SECRETARY') return false;
  return row.orgId === auth.user?.orgId && row.role === 'MEMBER';
};

/**
 * 是否可删除：与 canEdit 同策略
 */
const canDelete = (row: any) => canEdit(row);

const submitForm = async () => {
  if (!formDialog.form.username || !formDialog.form.name || !formDialog.form.orgId) {
    ElMessage.warning('请填写完整');
    return;
  }
  // SECRETARY 提交时不传 orgId/role（后端会强制为本支部/MEMBER）
  const payload: any = isAdmin.value
    ? {
        name: formDialog.form.name,
        phone: formDialog.form.phone,
        orgId: formDialog.form.orgId,
        role: formDialog.form.role,
        password: formDialog.form.password || undefined,
      }
    : {
        name: formDialog.form.name,
        phone: formDialog.form.phone,
        password: formDialog.form.password || undefined,
      };

  if (formDialog.isEdit) {
    await userApi.update(formDialog.editId, payload);
  } else {
    await userApi.create({
      username: formDialog.form.username,
      name: formDialog.form.name,
      phone: formDialog.form.phone,
      orgId: formDialog.form.orgId,
      role: formDialog.form.role,
      password: formDialog.form.password || undefined,
    });
  }
  ElMessage.success('保存成功');
  formDialog.visible = false;
  await loadList();
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除「${row.name}」吗？`, '提示', { type: 'warning' }).then(async () => {
    await userApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

const importDialog = ref(false);
const importResult = ref<any[] | null>(null);
const openImport = () => {
  importResult.value = null;
  importDialog.value = true;
};
const doImport = async (option: any) => {
  try {
    const res: any = await userApi.importFile(option.file);
    importResult.value = res;
    option.onSuccess?.(res);
    ElMessage.success('导入完成');
    await loadList();
  } catch (e: any) {
    option.onError?.(e);
    ElMessage.error(e?.message || '导入失败');
  }
};

const downloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
  // P0-7：同源 fetch 自动携带 HttpOnly Cookie 鉴权，无需手动附加 token
  fetch(`/api/users/template?format=${format}`)
    .then((r) => {
      if (!r.ok) throw new Error('下载失败');
      return r.blob();
    })
    .then((b) => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => ElMessage.error('下载失败'));
};

const roleLabel = (r: string) => ({ ADMIN: '系统管理员', SECRETARY: '支部书记', MEMBER: '党员' } as any)[r] ?? r;
const roleTag = (r: string) => ({ ADMIN: 'danger', SECRETARY: 'warning', MEMBER: '' } as any)[r] ?? '';
const formatDate = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(async () => {
  await loadOrgs();
  await loadList();
});
</script>
