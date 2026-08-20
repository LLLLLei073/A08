<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>学习内容管理</span>
          <el-button type="primary" @click="openCreate">新增内容</el-button>
        </div>
      </template>
      <el-form :inline="true" :model="filter" style="margin-bottom: 12px">
        <el-form-item label="关键词"><el-input v-model="filter.keyword" clearable placeholder="搜索标题" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filter.category" clearable placeholder="全部" style="width: 140px">
            <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filter.type" clearable placeholder="全部" style="width: 120px">
            <el-option value="ARTICLE" label="文章" />
            <el-option value="VIDEO" label="视频" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="loadList">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.type === 'VIDEO' ? 'warning' : ''">{{ row.type === 'VIDEO' ? '视频' : '文章' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column label="标签" width="200">
          <template #default="{ row }">
            <el-tag v-for="t in row.tags" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="公共" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isPublic ? 'success' : 'info'">{{ row.isPublic ? '是' : '否' }}</el-tag>
          </template>
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

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="720px" top="5vh" append-to-body>
      <el-form :model="dialog.form" label-width="100px">
        <el-form-item label="标题"><el-input v-model="dialog.form.title" /></el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="dialog.form.type">
            <el-radio value="ARTICLE">文章</el-radio>
            <el-radio value="VIDEO">视频</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分类"><el-input v-model="dialog.form.category" placeholder="如：党章/党史/时政/理论" /></el-form-item>
        <el-form-item label="标签">
          <el-select v-model="dialog.form.tags" multiple filterable allow-create default-first-option style="width: 100%" />
        </el-form-item>
        <el-form-item label="设为公共">
          <el-switch v-model="dialog.form.isPublic" />
          <span style="margin-left: 8px; color: #909399">公共内容所有党员可见</span>
        </el-form-item>
        <el-form-item label="视频文件" v-if="dialog.form.type === 'VIDEO'">
          <el-upload :http-request="uploadVideo" :show-file-list="false" accept="video/*">
            <el-button type="primary">点击上传</el-button>
          </el-upload>
          <span v-if="dialog.form.mediaUrl" style="margin-left: 12px; color: #67c23a">已上传: {{ dialog.form.mediaUrl }}</span>
        </el-form-item>
        <el-form-item label="视频时长(秒)" v-if="dialog.form.type === 'VIDEO'">
          <el-input-number v-model="dialog.form.duration" :min="0" />
        </el-form-item>
        <el-form-item label="正文" v-if="dialog.form.type === 'ARTICLE'">
          <MdEditor
            v-model="dialog.form.body"
            code-theme="atom"
            :no-iconfont="true"
            :no-katex="true"
            :no-mermaid="true"
            :style="{ height: '300px', width: '100%' }"
          />
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
import { defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import 'md-editor-v3/lib/style.css';
import { contentApi, uploadApi } from '@/api';

// 富文本编辑器（md-editor-v3 含 CodeMirror，约 351KB gz）改为动态加载：
// 仅当打开「正文」编辑框时才拉取对应 chunk，学习内容「列表页」不再承担编辑器运行时。
// 编辑器依赖的 highlight.js / screenfull 一并动态加载，并在加载时本地化配置、禁用原始 HTML（防 XSS）。
const MdEditor = defineAsyncComponent(async () => {
  const [m, hljs, atomCss, screenfull] = await Promise.all([
    import('md-editor-v3'),
    import('highlight.js/lib/common'),
    import('highlight.js/styles/atom-one-dark.css?url'),
    import('screenfull'),
  ]);
  m.config({
    editorExtensions: {
      highlight: {
        instance: hljs.default,
        css: { atom: { light: atomCss.default, dark: atomCss.default } },
      },
      screenfull: { instance: screenfull.default },
    },
    // 安全：禁用 Markdown 中的原始 HTML 标签，防止存储型 XSS
    markdownItConfig(md) {
      md.set({ html: false });
    },
  });
  return m.MdEditor;
});

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const categories = ref<string[]>([]);
const filter = reactive({ page: 1, pageSize: 20, keyword: '', category: '', type: '' });

const dialog = reactive({
  visible: false,
  title: '',
  isEdit: false,
  editId: 0,
  form: {
    title: '',
    type: 'ARTICLE' as 'ARTICLE' | 'VIDEO',
    body: '',
    mediaUrl: '',
    cover: '',
    category: '',
    tags: [] as string[],
    isPublic: false,
    duration: 0,
  },
});

const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await contentApi.list(filter);
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
};

const loadCategories = async () => {
  categories.value = await contentApi.categories();
};

const openCreate = () => {
  dialog.isEdit = false;
  dialog.title = '新增内容';
  dialog.form = { title: '', type: 'ARTICLE', body: '', mediaUrl: '', cover: '', category: '', tags: [], isPublic: false, duration: 0 };
  dialog.visible = true;
};

const openEdit = (row: any) => {
  dialog.isEdit = true;
  dialog.editId = row.id;
  dialog.title = '编辑内容';
  dialog.form = {
    title: row.title ?? '',
    type: row.type ?? 'ARTICLE',
    body: row.body ?? '',
    mediaUrl: row.mediaUrl ?? '',
    cover: row.cover ?? '',
    category: row.category ?? '',
    tags: row.tags ?? [],
    isPublic: row.isPublic ?? false,
    duration: row.duration ?? 0,
  };
  dialog.visible = true;
};

const uploadVideo = async (option: any) => {
  const res: any = await uploadApi.upload(option.file);
  dialog.form.mediaUrl = res.url;
  ElMessage.success('上传成功');
};

const submit = async () => {
  if (!dialog.form.title || !dialog.form.category) {
    ElMessage.warning('请填写标题和分类');
    return;
  }
  if (dialog.isEdit) {
    await contentApi.update(dialog.editId, dialog.form);
  } else {
    await contentApi.create(dialog.form);
  }
  ElMessage.success('保存成功');
  dialog.visible = false;
  await loadList();
  await loadCategories();
};

const remove = (row: any) => {
  ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '提示', { type: 'warning' }).then(async () => {
    await contentApi.remove(row.id);
    ElMessage.success('删除成功');
    await loadList();
  });
};

onMounted(async () => {
  await loadCategories();
  await loadList();
});
</script>
