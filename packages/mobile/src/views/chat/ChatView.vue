<template>
  <div class="chat-page">
    <van-nav-bar :title="group?.name || '群聊'" left-arrow @click-left="$router.back()">
      <template #right>
        <van-icon name="ellipsis" size="20" @click="showActions = true" />
      </template>
    </van-nav-bar>

    <div ref="msgBox" class="msg-list" @scroll="onScroll">
      <div v-if="hasMore" class="load-more" @click="loadHistory">查看更多消息</div>
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
            <div class="msg-sender">{{ m.mine ? '我' : (m.senderName || '未知发送者') }} · {{ formatTime(m.createdAt) }}</div>
            <div :class="['msg-bubble', { mine: m.mine }]">
              <template v-if="m.type === 'NOTICE'">[通知] {{ m.content }}</template>
              <template v-else-if="m.type === 'REPORT'">[AI 报告] {{ m.content }}</template>
              <template v-else>{{ m.content }}</template>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="input-bar">
      <van-field
        v-model="inputText"
        placeholder="输入消息..."
        :border="false"
        @keydown.enter="send"
      />
      <van-button type="primary" size="small" :disabled="!inputText.trim()" @click="send">发送</van-button>
    </div>

    <van-action-sheet v-model:show="showActions" :actions="actions" @select="onAction" cancel-text="取消" close-on-click-action />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { chatApi } from '@/api';

const route = useRoute();
const router = useRouter();
const groupId = Number(route.params.id);

const group = ref<any>(null);
const messages = ref<any[]>([]);
const inputText = ref('');
const msgBox = ref<HTMLElement>();
const hasMore = ref(false);
const oldestId = ref(0);
const showActions = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const actions = computed(() => {
  const list: any[] = [
    { name: group.value?.muted ? '取消免打扰' : '免打扰', value: 'mute' },
    { name: '清空聊天记录', value: 'clear' },
  ];
  if (group.value?.type === 'CUSTOM') {
    list.push({ name: '退出群聊', color: '#ee0a24', value: 'leave' });
  }
  return list;
});

const formatTime = (s: string) => new Date(s).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const loadGroup = async () => {
  group.value = await chatApi.getGroup(groupId);
};

const loadMessages = async (initial: boolean) => {
  if (initial) {
    const res: any = await chatApi.messages(groupId, { limit: 30 });
    messages.value = res;
    if (res.length > 0) oldestId.value = res[0].id;
    hasMore.value = res.length >= 30;
    await nextTick();
    scrollToBottom();
    await chatApi.markRead(groupId);
  } else {
    const res: any = await chatApi.messages(groupId, { limit: 100 });
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
  const res: any = await chatApi.messages(groupId, { before: oldestId.value, limit: 30 });
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
  if (!text) return;
  try {
    const msg = await chatApi.sendMessage(groupId, text);
    messages.value.push(msg);
    inputText.value = '';
    await nextTick();
    scrollToBottom();
  } catch (e: any) {
    showToast(e.message || '发送失败');
  }
};

const onAction = async (action: any) => {
  if (action.value === 'mute') {
    await chatApi.toggleMute(groupId, !group.value?.muted);
    group.value.muted = !group.value.muted;
    showToast(group.value.muted ? '已免打扰' : '已取消免打扰');
  } else if (action.value === 'clear') {
    try {
      await showConfirmDialog({
        title: '清空聊天记录',
        message: '仅清除当前账号的聊天记录，不影响其他群成员。清空后不可恢复，是否继续？',
        confirmButtonText: '确认清空',
      });
      await chatApi.clearHistory(groupId);
      messages.value = [];
      oldestId.value = 0;
      hasMore.value = false;
      showToast('聊天记录已清空');
    } catch {}
  } else if (action.value === 'leave') {
    try {
      await showConfirmDialog({ title: '提示', message: '确定退出该群聊？' });
      await chatApi.leaveGroup(groupId);
      showToast('已退出');
      router.back();
    } catch {}
  }
};

const startPoll = () => {
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') loadMessages(false);
  }, 5000);
};

onMounted(async () => {
  await loadGroup();
  await loadMessages(true);
  startPoll();
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
/* 100vh 在移动端浏览器包含地址栏高度，会把输入框顶出可视区；
   dvh 跟随地址栏收缩实时变化，100vh 作为旧浏览器兜底 */
.chat-page { display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: #f7f7f7; overflow: hidden; }
.chat-page :deep(.van-nav-bar) { flex-shrink: 0; }
.msg-list { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }
.load-more { text-align: center; color: #8b1a1a; font-size: 12px; padding: 8px; }
.msg-row { display: flex; margin-bottom: 12px; gap: 8px; }
.msg-row.mine { flex-direction: row-reverse; }
.msg-row.system { justify-content: center; }
.sys-msg { font-size: 12px; color: #999; background: rgba(0,0,0,0.04); padding: 4px 12px; border-radius: 999px; }
.msg-avatar { width: 34px; height: 34px; border-radius: 6px; background: #8b1a1a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.msg-body { max-width: 72%; }
.msg-sender { font-size: 11px; color: #999; margin-bottom: 2px; }
.msg-row.mine .msg-sender { text-align: right; }
.msg-bubble { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.5; background: #fff; word-break: break-all; }
.msg-bubble.mine { background: #8b1a1a; color: #fff; }
/* flex-shrink:0 防止消息多时输入框被压扁；safe-area 适配 iOS 全面屏底部横条 */
.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}
.input-bar .van-field { flex: 1; background: #f5f5f5; border-radius: 6px; padding: 4px 10px; }
</style>
