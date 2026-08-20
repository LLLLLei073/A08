<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>题库管理</span>
          <div class="header-actions">
            <el-dropdown split-button @click="downloadTemplate('xlsx')" @command="downloadTemplate">
              下载模板
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="xlsx">Excel 模板</el-dropdown-item>
                  <el-dropdown-item command="csv">CSV 模板</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="success" @click="openImport">批量导入</el-button>
            <el-button type="primary" @click="openCreate">新增题目</el-button>
          </div>
        </div>
      </template>
      <el-form :inline="true" :model="filter" style="margin-bottom: 12px">
        <el-form-item label="题干"><el-input v-model="filter.keyword" clearable placeholder="搜索题干" /></el-form-item>
        <el-form-item label="题型">
          <el-select v-model="filter.type" clearable style="width: 120px">
            <el-option value="SINGLE" label="单选" />
            <el-option value="MULTIPLE" label="多选" />
            <el-option value="JUDGE" label="判断" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filter.category" clearable style="width: 140px">
            <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="loadList">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="题型" width="80">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.type)">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stem" label="题干" min-width="280" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column label="答案" width="80">
          <template #default="{ row }">{{ answerLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
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

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="720px" append-to-body>
      <el-form :model="dialog.form" label-width="80px">
        <el-form-item label="题型">
          <template v-if="isLegacyQuestion">
            <el-tag :type="typeTag(dialog.form.type)">{{ typeLabel(dialog.form.type) }}</el-tag>
            <span class="legacy-tip">旧题型保留编辑兼容</span>
          </template>
          <template v-else>
            <el-tag type="success">判断题</el-tag>
            <span class="judge-tip">新增题目只需选择正确或错误</span>
          </template>
        </el-form-item>
        <el-form-item label="题干"><el-input v-model="dialog.form.stem" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="dialog.form.category" /></el-form-item>
        <el-form-item v-if="isLegacyQuestion" label="选项">
          <div v-for="(_, i) in dialog.form.options" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px; width: 100%">
            <el-input v-model="dialog.form.options[i]" :placeholder="`选项 ${String.fromCharCode(65 + i)}`" />
            <el-button type="danger" @click="dialog.form.options.splice(i, 1)" :disabled="dialog.form.options.length <= 2">删除</el-button>
          </div>
          <el-button @click="dialog.form.options.push('')">+ 新增选项</el-button>
        </el-form-item>
        <el-form-item label="答案">
          <el-radio-group v-if="!isLegacyQuestion" v-model="dialog.form.answer">
            <el-radio-button value="true">正确</el-radio-button>
            <el-radio-button value="false">错误</el-radio-button>
          </el-radio-group>
          <el-input v-else v-model="dialog.form.answer" placeholder="单选填 A，多选填 ABC" />
        </el-form-item>
        <el-form-item label="解析"><el-input v-model="dialog.form.analysis" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialog" title="批量导入判断题" width="520px" append-to-body>
      <el-upload :http-request="doImport" :show-file-list="true" accept=".xlsx,.csv" :limit="1" drag>
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">点击或拖拽 Excel / CSV 文件上传</div>
        <template #tip>
          <div class="el-upload__tip">
            仅支持 .xlsx 和 .csv，答案填写“正确”或“错误”，全程本地解析，不调用 AI。
            <el-link type="primary" @click="downloadTemplate('xlsx')">下载 Excel 模板</el-link>
            <span> / </span>
            <el-link type="primary" @click="downloadTemplate('csv')">下载 CSV 模板</el-link>
          </div>
        </template>
      </el-upload>
      <div v-if="importResult" style="margin-top: 12px">
        <el-alert
          :title="`成功 ${importResult.success} 条，失败 ${importResult.failed} 条`"
          :type="importResult.failed > 0 && importResult.success === 0 ? 'error' : 'info'"
          :closable="false"
        />
        <div v-if="importResult.failed > 0" style="margin-top: 8px; max-height: 180px; overflow: auto">
          <div v-for="(d, i) in importFailed" :key="i" style="font-size: 12px; color: #f56c6c">
            · {{ d.stem || '该行' }}：{{ d.error }}
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import { questionApi } from '@/api';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const categories = ref<string[]>([]);
const filter = reactive({ page: 1, pageSize: 20, keyword: '', type: '', category: '' });

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: { type: 'SINGLE', stem: '', options: ['', ''], answer: '', analysis: '', category: '' },
});

const importDialog = ref(false);
const importResult = ref<any | null>(null);
const importFailed = computed(() => (importResult.value?.detail ?? []).filter((d: any) => !d.success));
const isLegacyQuestion = computed(() => dialog.isEdit && dialog.form.type !== 'JUDGE');

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await questionApi.list(filter);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
};

const loadCategories = async () => {
  categories.value = await questionApi.categories();
};

const openCreate = () => {
  dialog.isEdit = false;
  dialog.title = '新增题目';
  dialog.form = { type: 'JUDGE', stem: '', options: ['正确', '错误'], answer: '', analysis: '', category: '' };
  dialog.visible = true;
};

const openEdit = (row: any) => {
  dialog.isEdit = true;
  dialog.editId = row.id;
  dialog.title = '编辑题目';
  dialog.form = { ...row, options: Array.isArray(row.options) ? [...row.options] : JSON.parse(row.options || '[]') };
  dialog.visible = true;
};

const submit = async () => {
  if (!dialog.form.stem.trim() || !dialog.form.category.trim() || !dialog.form.answer) {
    ElMessage.warning('请填写题干、分类并选择答案');
    return;
  }
  if (isLegacyQuestion.value && dialog.form.options.filter((option: string) => option.trim()).length < 2) {
    ElMessage.warning('旧选择题至少需要两个选项');
    return;
  }
  const payload = isLegacyQuestion.value
    ? dialog.form
    : { ...dialog.form, type: 'JUDGE', options: ['正确', '错误'] };
  if (dialog.isEdit) {
    await questionApi.update(dialog.editId, payload);
  } else {
    await questionApi.create(payload);
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await loadList();
  await loadCategories();
};

const openImport = () => {
  importResult.value = null;
  importDialog.value = true;
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除该题目吗？`, '提示', { type: 'warning' }).then(async () => {
    await questionApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

const doImport = async (option: any) => {
  try {
    const res: any = await questionApi.importFile(option.file);
    importResult.value = res;
    if (res.failed > 0 && res.success === 0) {
      ElMessage.error('导入失败：' + (res.detail?.[0]?.error || '请检查文件格式和答案内容'));
    } else if (res.failed > 0) {
      ElMessage.warning(`部分导入成功：${res.success} 条成功，${res.failed} 条失败`);
    } else {
      ElMessage.success(`导入成功 ${res.success} 条`);
    }
    option.onSuccess?.(res);
    await loadList();
    await loadCategories();
  } catch (e: any) {
    option.onError?.(e);
    ElMessage.error('导入失败：' + (e?.response?.data?.message || e.message || '未知错误'));
  }
};

const downloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
  // P0-7：同源 fetch 自动携带 HttpOnly Cookie 鉴权，无需手动附加 token
  fetch(`/api/questions/template?format=${format}`)
    .then((r) => {
      if (!r.ok) throw new Error('下载失败');
      return r.blob();
    })
    .then((b) => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questions-template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => ElMessage.error('下载失败'));
};

const answerLabel = (row: any) => {
  if (row.type !== 'JUDGE') return row.answer;
  return String(row.answer).toLowerCase() === 'true' ? '正确' : '错误';
};
const typeLabel = (t: string) => ({ SINGLE: '单选', MULTIPLE: '多选', JUDGE: '判断' } as any)[t] ?? t;
const typeTag = (t: string) => ({ SINGLE: '', MULTIPLE: 'warning', JUDGE: 'success' } as any)[t] ?? '';

onMounted(async () => {
  await loadCategories();
  await loadList();
});
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.judge-tip,
.legacy-tip {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
