<template>
  <div class="risk-page">
    <div class="risk-head"><div><span class="eyebrow">LEARNING CARE · RULES V1</span><h1>学习参与度预警</h1><p>根据可解释行为规则发现学习中断风险，用于关怀提醒，不进行情绪识别。</p></div><div class="actions"><el-select v-if="isAdmin" v-model="orgId" clearable placeholder="全部支部" @change="load" style="width:180px"><el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" /></el-select><el-button @click="load">查看记录</el-button><el-button type="primary" :loading="evaluating" @click="evaluate">重新评估</el-button></div></div>
    <div class="risk-metrics"><div><span>高风险</span><b class="high">{{ count('HIGH') }}</b></div><div><span>需关注</span><b class="medium">{{ count('MEDIUM') }}</b></div><div><span>状态平稳</span><b class="low">{{ count('LOW') }}</b></div><div><span>规则版本</span><b>V1</b></div></div>
    <el-card shadow="never" class="risk-card">
      <el-table :data="list" v-loading="loading" row-key="userId">
        <el-table-column label="党员" min-width="150"><template #default="{row}"><b>{{ row.userName }}</b><small>{{ row.orgName }}</small></template></el-table-column>
        <el-table-column label="风险分" width="150"><template #default="{row}"><div class="risk-score"><b :class="row.level.toLowerCase()">{{ row.score }}</b><el-progress :percentage="row.score" :show-text="false" :color="riskColor(row.level)" /></div></template></el-table-column>
        <el-table-column label="等级" width="100"><template #default="{row}"><el-tag :type="tagType(row.level)" effect="dark">{{ levelText(row.level) }}</el-tag></template></el-table-column>
        <el-table-column label="透明依据" min-width="330"><template #default="{row}"><span v-for="f in row.factors.filter((x:any)=>x.contribution>0)" :key="f.code" class="factor">{{ f.label }} +{{ f.contribution }}</span><span v-if="!row.factors.some((x:any)=>x.contribution>0)" class="muted">暂无风险加分项</span></template></el-table-column>
        <el-table-column label="最近提醒" width="170"><template #default="{row}">{{ row.lastNotifiedAt ? formatTime(row.lastNotifiedAt) : '尚未提醒' }}</template></el-table-column>
        <el-table-column label="操作" width="130" fixed="right"><template #default="{row}"><el-button size="small" type="primary" :disabled="row.level==='LOW'" @click="remind(row)">发送关怀提醒</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="点击重新评估生成参与度风险快照" />
    </el-card>
    <el-alert class="explain" type="info" :closable="false" title="评分只使用未学习天数、逾期任务、学习/成绩趋势和通知未读率。系统不采集表情、语音或心理状态；提醒内容不会暴露风险分和个人行为明细。" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { EngagementRiskDto, OrgNode } from '@ai-party-school/shared';
import { engagementApi, orgApi } from '@/api';
import { useAuthStore } from '@/store/auth';
const auth=useAuthStore(); const isAdmin=computed(()=>auth.role==='ADMIN'); const list=ref<EngagementRiskDto[]>([]); const orgs=ref<OrgNode[]>([]); const orgId=ref<number>(); const loading=ref(false); const evaluating=ref(false);
const flatten=(nodes:OrgNode[]):OrgNode[]=>nodes.flatMap(n=>[n,...flatten(n.children||[])]);
const load=async()=>{loading.value=true;try{list.value=await engagementApi.list(orgId.value) as any;}finally{loading.value=false;}};
const evaluate=async()=>{evaluating.value=true;try{list.value=await engagementApi.evaluate(orgId.value) as any;ElMessage.success('参与度风险已按最新行为数据更新');}finally{evaluating.value=false;}};
const remind=async(row:EngagementRiskDto)=>{await engagementApi.remind(row.userId);ElMessage.success('关怀提醒已发送');await load();};
const count=(level:string)=>list.value.filter(x=>x.level===level).length; const riskColor=(level:string)=>level==='HIGH'?'#8b1a1a':level==='MEDIUM'?'#c58b32':'#6f8f57'; const tagType=(level:string)=>level==='HIGH'?'danger':level==='MEDIUM'?'warning':'success'; const levelText=(level:string)=>({HIGH:'高风险',MEDIUM:'需关注',LOW:'平稳'} as any)[level]; const formatTime=(v:string)=>new Date(v).toLocaleString('zh-CN');
onMounted(async()=>{if(isAdmin.value){const tree:any=await orgApi.tree();orgs.value=flatten(tree).filter(x=>x.level===2);}await load();});
</script>
<style scoped>
.risk-page{padding:28px}.risk-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:2px;color:#a8893e}.risk-head h1{margin:6px 0 4px;font:700 28px var(--ps-font-serif)}.risk-head p{margin:0;color:var(--ps-muted)}.actions{display:flex;gap:8px}.risk-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.risk-metrics div{background:#fff;border:1px solid var(--ps-line-soft);border-radius:13px;padding:17px 20px;display:flex;justify-content:space-between;align-items:center}.risk-metrics span{color:var(--ps-muted)}.risk-metrics b{font:700 25px Georgia}.risk-metrics .high{color:#8b1a1a}.risk-metrics .medium{color:#bd7d22}.risk-metrics .low{color:#62804e}.risk-card{border:1px solid var(--ps-line);border-radius:14px}.risk-card small{display:block;color:var(--ps-muted);margin-top:4px}.risk-score{display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:center}.risk-score b.high{color:#8b1a1a}.risk-score b.medium{color:#bd7d22}.risk-score b.low{color:#62804e}.factor{display:inline-block;margin:2px 5px 2px 0;padding:3px 7px;border-radius:5px;background:#f8efe4;color:#765331;font-size:11px}.muted{color:var(--ps-muted)}.explain{margin-top:14px}@media(max-width:1100px){.risk-head{align-items:flex-start;gap:18px}.risk-metrics{grid-template-columns:repeat(2,1fr)}}
</style>
