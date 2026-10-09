<template>
  <PetDog :custom-model-path="customModelPath" />
  <button class="reset-btn" @click="resetAll" title="清空本地模型 & 任务，用于重新测试">🔄 重置测试数据</button>
  <UploadPetModal
      v-if="showModal"
      :resume-task-id="resumeTaskId"
      :resume-stage="resumeTaskStage"
      @success="onSuccess"
      @completed="onCompleted"
      @enter="onEnter"
      @close="showModal = false"
    />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PetDog from './components/PetDog.vue'
import UploadPetModal from './components/UploadPetModal.vue'

const localModel = localStorage.getItem('pet3dLocalModel')
const customModelPath = ref(localModel || '')

let resumeTaskId = localStorage.getItem('pet3dTaskId') || ''
let resumeTaskStage: 'model' | 'rig' = (localStorage.getItem('pet3dTaskStage') as 'model' | 'rig') || 'model'
const showModal = ref(!localModel)

function onSuccess(taskId: string) {
  console.log('3D 任务已提交，taskId:', taskId)
}

function onCompleted(result: { taskId: string; modelUrl: string }) {
  console.log('3D 模型生成完成，本地路径:', result.modelUrl)
  customModelPath.value = result.modelUrl
}

function onEnter() {
  showModal.value = false
}

// 清空本地持久化，强制重新走一遍上传→建模→绑骨流程
async function resetAll() {
  const localFile = localStorage.getItem('pet3dLocalModel')
  localStorage.removeItem('pet3dLocalModel')
  localStorage.removeItem('pet3dTaskId')
  localStorage.removeItem('pet3dTaskStage')
  customModelPath.value = ''

  if (localFile) {
    try {
      const res = await window.ipcRenderer.invoke('delete-pet-model', localFile)
      console.log('[resetAll] 删除本地模型:', res.success ? '成功' : res.error)
    } catch (e: any) {
      console.warn('[resetAll] 删除失败:', e?.message ?? e)
    }
  }

  // 刷新当前 session 的恢复值为空
  resumeTaskId = ''
  resumeTaskStage = 'model'
  showModal.value = true
}
</script>

<style scoped lang="less">
.reset-btn {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 10000;
  padding: 8px 14px;
  background: #ff6b6b;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  -webkit-app-region: no-drag;
  app-region: no-drag;

  &:hover {
    background: #ff5252;
  }
}
</style>
