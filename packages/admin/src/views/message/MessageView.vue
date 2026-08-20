<template>
  <div class="msg-page">
    <div class="page-inner">
      <el-tabs v-model="activeTab" class="msg-tabs">
        <!-- ===== 群聊 ===== -->
        <el-tab-pane label="群聊" name="chat">
          <div class="chat-layout">
            <!-- 群列表 -->
            <div class="group-panel">
              <div class="panel-header">
                <span class="panel-title">群聊列表</span>
                <el-button size="small" type="primary" class="create-group-btn" @click="openCreate">建群</el-button>
              </div>
              <div class="group-list">
                <div
                  v-for="g in groups"
                  :key="g.id"
                  :class="['group-item', { active: currentGroupId === g.id }]"
                  @click="openGroup(g.id)"
                >
                  <div class="gi-main">
                    <div class="gi-name">
                      <el-tag v-if="g.type === 'MANAGE'" size="small" type="danger" effect="plain">管理</el-tag>
                      <el-tag v-else-if="g.type === 'ORG'" size="small" type="warning" effect="plain">支部</el-tag>
                      <span>{{ g.name }}</span>
                    </div>
                    <div class="gi-last">{{ lastMessageLabel(g.lastMessage) }}</div>
                  </div>
                  <el-badge v-if="g.unread > 0" :value="g.unread" :max="99" class="gi-badge" />
                </div>
                <div v-if="groups.length === 0" class="empty-hint">暂无群聊</div>
              </div>
            </div>

            <!-- 聊天窗口 -->
            <div class="chat-panel" v-if="currentGroup">
              <div class="chat-header">
                <div class="ch-left">
                  <span class="ch-name">{{ currentGroup.name }}</span>
                  <span class="ch-count">{{ currentGroup.memberCount }} 人</span>
                </div>
                <div class="ch-right">
                  <el-button size="small" link @click="showMembers = true">成员</el-button>
                  <el-button size="small" link @click="toggleMute">{{ currentGroup.muted ? '取消免打扰' : '免打扰' }}</el-button>
                  <el-button size="small" link @click="clearHistory">清空记录</el-button>
                  <el-button v-if="currentGroup.type === 'CUSTOM' && currentGroup.myRole === 'OWNER'" size="small" link type="danger" @click="dissolve">解散</el-button>
                </div>
              </div>
              <div ref="msgBox" class="msg-list" @scroll="onScroll">
                <div v-if="hasMore" class="load-more" @click="loadHistory">加载更多消息</div>
                <div v-for="m in messages" :key="m.id" :class="['msg-row', { mine: m.mine, system: m.type === 'SYSTEM' }]">
                  <template v-if="m.recalled">
                    <div class="sys-msg">已撤回一条消息</div>
                  </template>
                  <template v-else-if="m.type === 'SYSTEM'">
                    <div class="sys-msg">{{ m.content }}</div>
                  </template>
                  <template v-else>
                    <div class="msg-avatar" v-if="!m.mine">{{ (m.senderName || '?')[0] }}</div>
                    <div class="msg-body">
                      <div class="msg-meta">{{ m.mine ? '我' : (m.senderName || '未知发送者') }} · {{ formatTime(m.createdAt) }}</div>
                      <div :class="['msg-bubble', { mine: m.mine }]">
                        <template v-if="m.type === 'NOTICE'">[通知] {{ m.content }}</template>
                        <template v-else>{{ m.content }}</template>
                      </div>
                      <el-button v-if="m.mine && canRecall(m)" size="small" link class="recall-btn" @click="recall(m)">撤回</el-button>
                    </div>
                  </template>
                </div>
              </div>
              <div class="chat-input">
                <el-input
                  v-model="inputText"
                  type="textarea"
                  :rows="2"
                  placeholder="输入消息，Enter 发送"
                  resize="none"
                  @keydown.enter.exact.prevent="send"
                />
                <el-button type="primary" @click="send" :disabled="!inputText.trim()">发送</el-button>
              </div>
            </div>
            <div v-else class="chat-empty">
              <el-icon size="48"><ChatDotRound /></el-icon>
              <div>选择一个群聊开始对话</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ===== 通知发布（群聊下的子功能） ===== -->
        <el-tab-pane label="通知发布" name="notify">
          <el-card shadow="never">
            <div class="notify-header">
              <span class="panel-title">发布通知</span>
              <el-button @click="loadSent" :loading="sentLoading">刷新</el-button>
            </div>
            <el-form :model="notifyForm" label-width="90px" class="notify-form">
              <el-form-item label="标题">
                <el-input v-model="notifyForm.title" maxlength="120" show-word-limit />
              </el-form-item>
              <el-form-item label="内容">
                <el-input v-model="notifyForm.content" type="textarea" :rows="4" maxlength="5000" show-word-limit />
              </el-form-item>
              <el-form-item label="级别">
                <el-radio-group v-model="notifyForm.level">
                  <el-radio value="NORMAL">普通</el-radio>
                  <el-radio value="IMPORTANT">重要</el-radio>
                  <el-radio value="URGENT">紧急</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="范围">
                <el-radio-group v-model="notifyForm.scope" @change="onScopeChange">
                  <el-radio v-if="auth.role === 'ADMIN'" value="ALL">全体人员</el-radio>
                  <el-radio value="ORG">指定支部</el-radio>
                  <el-radio value="USER">指定人员</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="支部" v-if="notifyForm.scope === 'ORG'">
                <el-select v-model="notifyForm.orgIds" multiple placeholder="选择支部" style="width: 100%">
                  <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="人员" v-if="notifyForm.scope === 'USER'">
                <el-select v-model="notifyForm.userIds" multiple filterable placeholder="选择党员" style="width: 100%">
                  <el-option v-for="u in users" :key="u.id" :label="u.name" :value="u.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="同步到群">
                <el-switch v-model="notifyForm.syncToGroup" />
                <span class="hint">勾选后同时在对应支部群发布一条消息</span>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="sending" @click="sendNotify">发布通知</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card shadow="never" style="margin-top: 16px">
            <div class="notify-header">
              <span class="panel-title">已发送通知</span>
            </div>
            <el-table :data="sentList" v-loading="sentLoading" stripe>
              <el-table-column prop="title" label="标题" min-width="160" />
              <el-table-column prop="scope" label="范围" width="100">
                <template #default="{ row }">{{ scopeLabel(row.scope) }}</template>
              </el-table-column>
              <el-table-column prop="level" label="级别" width="80">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.level === 'URGENT' ? 'danger' : row.level === 'IMPORTANT' ? 'warning' : 'info'">{{ levelLabel(row.level) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="发送人" width="110">
                <template #default="{ row }">{{ row.senderName || '系统' }}</template>
              </el-table-column>
              <el-table-column label="已读" width="100">
                <template #default="{ row }">{{ row.readCount }} / {{ row.recipientCount }}</template>
              </el-table-column>
              <el-table-column prop="createdAt" label="发送时间" width="160">
                <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
            <el-pagination
              v-model:current-page="sentPage"
              :page-size="20"
              :total="sentTotal"
              layout="total, prev, pager, next"
              @current-change="loadSent"
              style="margin-top: 12px; justify-content: flex-end"
            />
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 建群对话框 -->
    <el-dialog v-model="createDialog" title="创建群聊" width="480px" append-to-body>
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="群名称">
          <el-input v-model="createForm.name" placeholder="如：第一小组学习交流" />
        </el-form-item>
        <el-form-item label="群成员">
          <el-select v-model="createForm.memberIds" multiple filterable placeholder="选择成员" style="width: 100%">
            <el-option v-for="c in contacts" :key="c.id" :label="c.name + (c.orgName ? '（' + c.orgName + '）' : '')" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="群公告">
          <el-input v-model="createForm.notice" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 成员列表 -->
    <el-drawer v-model="showMembers" title="群成员" size="360px" append-to-body>
      <el-table :data="members" stripe>
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="orgName" label="支部" width="120" />
        <el-table-column prop="groupRole" label="群身份" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.groupRole === 'OWNER' ? 'danger' : row.groupRole === 'ADMIN' ? 'warning' : 'info'">{{ roleLabel(row.groupRole) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, nextTick, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import { chatApi, notificationApi, orgApi, userApi } from '@/api';

const auth = useAuthStore();
const activeTab = ref('chat');

const orgs = ref<any[]>([]);
const users = ref<any[]>([]);
const contacts = ref<any[]>([]);

const formatTime = (s?: string) => (s ? new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const scopeLabel = (s: string) => ({ ALL: '全体', ORG: '支部', USER: '人员' } as any)[s] ?? s;
const levelLabel = (s: string) => ({ NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急' } as any)[s] ?? s;
const roleLabel = (s: string) => ({ OWNER: '群主', ADMIN: '管理员', MEMBER: '成员' } as any)[s] ?? s;
const RECALL_WINDOW_MS = 2 * 60 * 1000;
const lastMessageLabel = (last?: any) => {
  if (!last) return '暂无消息';
  const sender = last.senderName || (last.type === 'SYSTEM' ? '系统' : '未知发送者');
  return `${sender}: ${last.content}`;
};
// ===== 群聊 =====
const groups = ref<any[]>([]);
const currentGroupId = ref<number | null>(null);
const currentGroup = ref<any>(null);
const messages = ref<any[]>([]);
const inputText = ref('');
const msgBox = ref<HTMLElement>();
const hasMore = ref(false);
const oldestId = ref(0);
const recallClock = ref(Date.now());
let pollTimer: ReturnType<typeof setInterval> | null = null;
const canRecall = (message: any) =>
  !message.recalled && recallClock.value - new Date(message.createdAt).getTime() <= RECALL_WINDOW_MS;

const loadGroups = async () => {
  try {
    groups.value = await chatApi.groups();
    if (currentGroupId.value && !groups.value.find((g) => g.id === currentGroupId.value)) {
      currentGroupId.value = null;
      currentGroup.value = null;
      messages.value = [];
    }
  } catch {}
};

const openGroup = async (id: number) => {
  currentGroupId.value = id;
  currentGroup.value = await chatApi.getGroup(id);
  messages.value = [];
  oldestId.value = 0;
  hasMore.value = false;
  await loadMessages(true);
  await chatApi.markRead(id);
  startPoll();
};

const loadMessages = async (initial: boolean) => {
  if (!currentGroupId.value) return;
  if (initial) {
    const res: any = await chatApi.messages(currentGroupId.value, { limit: 30 });
    messages.value = res;
    if (res.length > 0) oldestId.value = res[0].id;
    hasMore.value = res.length >= 30;
    await nextTick();
    scrollToBottom();
  } else {
    // 拉取最近消息并合并，既追加新消息，也同步其他客户端发起的撤回状态。
    const res: any = await chatApi.messages(currentGroupId.value, { limit: 100 });
    const existing = new Map(messages.value.map((message) => [message.id, message]));
    let appended = false;
    for (const message of res) {
      const current = existing.get(message.id);
      if (current) Object.assign(current, message);
      else {
        messages.value.push(message);
        appended = true;
      }
    }
    if (appended) {
      await nextTick();
      scrollToBottom();
    }
  }
};

const loadHistory = async () => {
  if (!currentGroupId.value || oldestId.value <= 1) { hasMore.value = false; return; }
  const res: any = await chatApi.messages(currentGroupId.value, { before: oldestId.value, limit: 30 });
  if (res.length > 0) {
    const prevHeight = msgBox.value?.scrollHeight ?? 0;
    messages.value.unshift(...res);
    oldestId.value = res[0].id;
    hasMore.value = res.length >= 30;
    await nextTick();
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight - prevHeight;
  } else {
    hasMore.value = false;
  }
};

const onScroll = () => {
  if (msgBox.value && msgBox.value.scrollTop < 50 && hasMore.value) {
    loadHistory();
  }
};

const scrollToBottom = () => {
  if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight;
};

const send = async () => {
  const text = inputText.value.trim();
  if (!text || !currentGroupId.value) return;
  try {
    const msg = await chatApi.sendMessage(currentGroupId.value, text);
    messages.value.push(msg);
    inputText.value = '';
    await nextTick();
    scrollToBottom();
    loadGroups();
  } catch (e: any) { ElMessage.error(e.message || '发送失败'); }
};

const recall = async (m: any) => {
  try {
    await chatApi.recallMessage(m.id);
    m.recalled = true;
    m.content = '已撤回一条消息';
    loadGroups();
  } catch (e: any) { ElMessage.error(e.message || '撤回失败'); }
};

const toggleMute = async () => {
  if (!currentGroup.value) return;
  await chatApi.toggleMute(currentGroup.value.id, !currentGroup.value.muted);
  currentGroup.value.muted = !currentGroup.value.muted;
  ElMessage.success(currentGroup.value.muted ? '已免打扰' : '已取消免打扰');
};

const clearHistory = async () => {
  if (!currentGroup.value) return;
  try {
    await ElMessageBox.confirm(
      '仅清除当前账号的聊天记录，不影响其他群成员。清空后不可恢复，是否继续？',
      '清空聊天记录',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' },
    );
    await chatApi.clearHistory(currentGroup.value.id);
    messages.value = [];
    oldestId.value = 0;
    hasMore.value = false;
    await loadGroups();
    ElMessage.success('聊天记录已清空');
  } catch {}
};

const dissolve = async () => {
  try {
    await ElMessageBox.confirm('确认解散该群聊？此操作不可恢复。', '提示', { type: 'warning' });
    await chatApi.dissolveGroup(currentGroup.value.id);
    ElMessage.success('群聊已解散');
    currentGroupId.value = null;
    currentGroup.value = null;
    messages.value = [];
    loadGroups();
  } catch {}
};

const startPoll = () => {
  stopPoll();
  pollTimer = setInterval(() => {
    recallClock.value = Date.now();
    if (currentGroupId.value && document.visibilityState === 'visible') {
      loadMessages(false);
      loadGroups();
    }
  }, 4000);
};
const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };

// ===== 建群 =====
const createDialog = ref(false);
const createForm = reactive({ name: '', memberIds: [] as number[], notice: '' });

const openCreate = async () => {
  createForm.name = '';
  createForm.memberIds = [];
  createForm.notice = '';
  contacts.value = await chatApi.contacts();
  createDialog.value = true;
};

const doCreate = async () => {
  if (!createForm.name.trim()) { ElMessage.warning('请输入群名称'); return; }
  if (createForm.memberIds.length < 1) { ElMessage.warning('至少选择 1 名成员'); return; }
  try {
    await chatApi.createGroup({ name: createForm.name, memberIds: createForm.memberIds, notice: createForm.notice });
    ElMessage.success('群聊已创建');
    createDialog.value = false;
    loadGroups();
  } catch (e: any) { ElMessage.error(e.message || '创建失败'); }
};

// ===== 成员 =====
const showMembers = ref(false);
const members = ref<any[]>([]);

// 监听 showMembers：打开抽屉时加载成员列表
const onShowMembers = async (v: boolean) => {
  if (v && currentGroupId.value) {
    members.value = await chatApi.listMembers(currentGroupId.value);
  }
};
watch(showMembers, onShowMembers);

// ===== 通知 =====
const notifyForm = reactive({ title: '', content: '', level: 'NORMAL', scope: 'ORG', orgIds: [] as number[], userIds: [] as number[], syncToGroup: true });
const sending = ref(false);
const sentList = ref<any[]>([]);
const sentTotal = ref(0);
const sentPage = ref(1);
const sentLoading = ref(false);

const onScopeChange = () => {
  if (notifyForm.scope !== 'ORG') notifyForm.orgIds = [];
  if (notifyForm.scope !== 'USER') notifyForm.userIds = [];
};

const sendNotify = async () => {
  if (!notifyForm.title.trim() || !notifyForm.content.trim()) { ElMessage.warning('请填写标题与内容'); return; }
  sending.value = true;
  try {
    await notificationApi.send({ ...notifyForm });
    ElMessage.success('通知已发布');
    notifyForm.title = '';
    notifyForm.content = '';
    loadSent();
  } catch (e: any) { ElMessage.error(e.message || '发布失败'); }
  finally { sending.value = false; }
};

const loadSent = async () => {
  sentLoading.value = true;
  try {
    const res: any = await notificationApi.listSent(sentPage.value, 20);
    sentList.value = res.list ?? [];
    sentTotal.value = res.total ?? 0;
  } catch {} finally { sentLoading.value = false; }
};

// ===== 初始化 =====
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

onMounted(async () => {
  await loadOrgs();
  loadUsers();
  loadGroups();
  loadSent();
});
onUnmounted(stopPoll);
</script>

<style scoped>
.msg-page { padding: 20px 28px; }
.page-inner { max-width: 1200px; margin: 0 auto; }
.panel-title { font-size: 16px; font-weight: 600; color: var(--ps-ink); }
.hint { color: var(--ps-muted); font-size: 12px; margin-left: 6px; }
.create-group-btn {
  --el-button-text-color: #fff;
  --el-button-hover-text-color: #fff;
  --el-button-active-text-color: #fff;
}

.chat-layout { display: flex; gap: 16px; height: calc(100vh - 220px); min-height: 500px; }
.group-panel { width: 280px; background: #fff; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--ps-line); }
.group-list { flex: 1; overflow-y: auto; }
.group-item { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f5f5f5; transition: background 0.2s; }
.group-item:hover { background: var(--ps-red-soft); }
.group-item.active { background: var(--ps-red-soft); border-left: 3px solid var(--ps-red); }
.gi-main { flex: 1; min-width: 0; }
.gi-name { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gi-last { font-size: 12px; color: var(--ps-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gi-badge { margin-left: 8px; }
.empty-hint { text-align: center; padding: 40px; color: var(--ps-muted); font-size: 13px; }

.chat-panel { flex: 1; background: #fff; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.chat-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--ps-line); }
.ch-name { font-size: 15px; font-weight: 600; }
.ch-count { font-size: 12px; color: var(--ps-muted); margin-left: 8px; }
.msg-list { flex: 1; overflow-y: auto; padding: 16px; background: #faf9f7; }
.load-more { text-align: center; color: var(--ps-red); font-size: 12px; cursor: pointer; padding: 8px; }
.msg-row { display: flex; margin-bottom: 14px; gap: 8px; }
.msg-row.mine { flex-direction: row-reverse; }
.msg-row.system { justify-content: center; }
.sys-msg { font-size: 12px; color: var(--ps-muted); background: rgba(0,0,0,0.04); padding: 4px 12px; border-radius: 999px; }
.msg-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--ps-red); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.msg-body { max-width: 70%; }
.msg-meta { font-size: 11px; color: var(--ps-muted); margin-bottom: 2px; }
.msg-row.mine .msg-meta { text-align: right; }
.msg-bubble { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.5; background: #fff; border: 1px solid var(--ps-line); word-break: break-all; }
.msg-bubble.mine { background: var(--ps-red); color: #fff; border-color: var(--ps-red); }
.recall-btn { font-size: 11px; padding: 0; margin-top: 2px; }
.chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--ps-line); align-items: flex-end; }
.chat-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ps-muted); gap: 12px; }

.notify-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.notify-form { max-width: 700px; }
</style>
