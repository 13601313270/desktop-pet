<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  // 启动时检测到本地有未完成任务，传入以恢复轮询
  resumeTaskId?: string
  // 恢复时的阶段：model=建模 rig=骨骼生成
  resumeStage?: 'model' | 'rig'
}>()

const emit = defineEmits<{
  (e: 'success', taskId: string): void
  (e: 'completed', result: { taskId: string; modelUrl: string }): void
  (e: 'enter'): void
  (e: 'close'): void
}>()

const STORAGE_KEY = 'pet3dTaskId'
const STAGE_KEY = 'pet3dTaskStage'
const GET_TASK_URL = 'https://api.studying1v1.com/pet/getTaskInfo'
const ANIM_RIG_URL = 'https://api.studying1v1.com/pet/animationsRig'
const POLL_INTERVAL = 3000
// 视为任务失败的终态
const FAIL_STATUS = ['failed', 'canceled', 'banned', 'expired']

const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string>('')
const fileName = ref<string>('')
const fileBuffer = ref<ArrayBuffer | null>(null)
const uploading = ref(false)
const taskId = ref<string>('')
const errorMsg = ref<string>('')

// 轮询相关状态
const polling = ref(false)
const progress = ref(0)
const taskStatus = ref('')
const modelUrl = ref('')
const previewImg = ref('')
const showResume = ref(false)
const downloading = ref(false)
// 当前阶段：model=建模 rig=骨骼生成
const stage = ref<'model' | 'rig'>('model')
let pollTimer: ReturnType<typeof setTimeout> | null = null

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 只允许图片
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请选择图片文件'
    return
  }
  errorMsg.value = ''
  taskId.value = ''

  fileName.value = file.name

  const reader = new FileReader()
  reader.onload = () => {
    previewUrl.value = reader.result as string
  }
  reader.readAsDataURL(file)

  // 读 ArrayBuffer 用于上传
  const bufferReader = new FileReader()
  bufferReader.onload = () => {
    fileBuffer.value = bufferReader.result as ArrayBuffer
  }
  bufferReader.readAsArrayBuffer(file)
}

async function handleUpload() {
  console.log('[UploadPetModal] handleUpload called, fileBuffer=', !!fileBuffer.value, 'fileName=', fileName.value)
  if (!fileBuffer.value || !fileName.value) {
    errorMsg.value = '请先选择一张狗狗的照片'
    console.warn('[UploadPetModal] 缺少 fileBuffer 或 fileName')
    return
  }
  uploading.value = true
  errorMsg.value = ''

  try {
    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer.value]), fileName.value)

    console.log('[UploadPetModal] 发送请求...')
    const resp = await fetch('https://api.studying1v1.com/pet/create3DByImg', {
      method: 'POST',
      body: formData,
    })
    const text = await resp.text()
    console.log('[UploadPetModal] 原始响应:', text)

    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!resp.ok) {
      errorMsg.value = `HTTP ${resp.status}`
      return
    }

    const tid = data?.data ?? data?.data?.data ?? (typeof data === 'string' ? data : '')
    taskId.value = String(tid)
    console.log('[UploadPetModal] taskId:', taskId.value)

    // 持久化 taskId + 阶段，断网/重启后可恢复查询
    localStorage.setItem(STORAGE_KEY, taskId.value)
    localStorage.setItem(STAGE_KEY, 'model')
    emit('success', taskId.value)
    startPolling(taskId.value, 'model')
  } catch (err: any) {
    console.error('[UploadPetModal] 请求异常:', err)
    errorMsg.value = err?.message ?? '请求异常'
  } finally {
    uploading.value = false
  }
}

async function startPolling(tid: string, stageName: 'model' | 'rig' = 'model') {
  if (polling.value) return
  polling.value = true
  errorMsg.value = ''
  progress.value = 0
  stage.value = stageName
  let currentTid = tid
  let errCount = 0

  const poll = async () => {
    if (!polling.value) return
    try {
      const resp = await fetch(`${GET_TASK_URL}?taskId=${currentTid}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      console.log('[UploadPetModal] 轮询结果:', data)
      errCount = 0

      taskStatus.value = data?.status ?? ''
      if (data?.progress != null) {
        progress.value = Math.min(100, Math.max(0, Number(data.progress)))
      }

      if (data?.output?.model_url) {
        if (stage.value === 'model') {
          // 阶段一（建模）完成：不下载，请求绑骨进入阶段二
          await requestRig(currentTid)
          if (!polling.value) return // requestRig 失败已终止
          currentTid = taskId.value
          progress.value = 0
        } else {
          // 阶段二（绑骨）完成：模型已带骨骼，下载到本地
          modelUrl.value = data.output.model_url
          previewImg.value = data.output.rendered_image_url ?? ''
          polling.value = false
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(STAGE_KEY)
          // 下载到本地持久化（渲染进程无法写文件系统，走主进程）
          downloading.value = true
          try {
            const res = await window.ipcRenderer.invoke('download-pet-model', modelUrl.value)
            if (res.success) {
              localStorage.setItem('pet3dLocalModel', res.path)
              emit('completed', { taskId: currentTid, modelUrl: res.path })
            } else {
              errorMsg.value = '模型下载失败：' + res.error
            }
          } catch (e: any) {
            errorMsg.value = '模型下载异常：' + (e?.message ?? String(e))
          } finally {
            downloading.value = false
          }
          return
        }
      }

      if (FAIL_STATUS.includes(taskStatus.value)) {
        polling.value = false
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(STAGE_KEY)
        errorMsg.value = `${stage.value === 'rig' ? '骨骼生成' : '建模'}失败（${taskStatus.value}）`
        return
      }
    } catch (err) {
      // 断网等异常：保留 taskId，继续重试；连续失败过多则暂停
      errCount++
      console.warn('[UploadPetModal] 轮询异常:', err)
      if (errCount >= 10) {
        polling.value = false
        errorMsg.value = '网络异常，已暂停查询；taskId 已保存在本地，下次启动可继续'
        return
      }
    }

    pollTimer = setTimeout(poll, POLL_INTERVAL)
  }
  poll()
}

// 请求骨骼生成，成功后切换持久化的 taskId 为绑骨任务
async function requestRig(tid: string) {
  try {
    const resp = await fetch(`${ANIM_RIG_URL}?taskId=${tid}`)
    const text = await resp.text()
    console.log('[UploadPetModal] animationsRig 原始响应:', text)
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!resp.ok || !data?.result || !data?.data) {
      polling.value = false
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STAGE_KEY)
      errorMsg.value = `骨骼生成请求失败：${data?.raw ?? `HTTP ${resp.status}`}`
      return
    }

    taskId.value = String(data.data)
    localStorage.setItem(STORAGE_KEY, taskId.value)
    localStorage.setItem(STAGE_KEY, 'rig')
    stage.value = 'rig'
    console.log('[UploadPetModal] 绑骨 taskId:', taskId.value)
  } catch (err: any) {
    polling.value = false
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STAGE_KEY)
    errorMsg.value = '骨骼生成请求异常：' + (err?.message ?? String(err))
  }
}

function stopPolling() {
  polling.value = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function resumePoll() {
  if (!props.resumeTaskId) return
  showResume.value = false
  taskId.value = props.resumeTaskId
  startPolling(props.resumeTaskId, props.resumeStage === 'rig' ? 'rig' : 'model')
}

function dismissResume() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STAGE_KEY)
  showResume.value = false
  emit('close')
}

onMounted(() => {
  if (props.resumeTaskId) {
    showResume.value = true
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <h2>上传你的狗狗照片</h2>
      <p class="tip">请上传一张狗狗的全身照，用于生成专属 3D 模型</p>

      <div v-if="showResume && !polling && !modelUrl" class="resume-box">
        <p>检测到之前提交的 3D 生成任务，是否用已保存的 taskId 继续查询？</p>
        <p class="resume-id">{{ resumeTaskId }}</p>
        <div class="resume-actions">
          <button class="btn-cancel" @click="dismissResume">忽略</button>
          <button class="btn-primary" @click="resumePoll">继续查询</button>
        </div>
      </div>

      <div v-if="!modelUrl" class="drop-zone" @click="openFilePicker">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          hidden
          @change="handleFileChange"
        />
        <div v-if="previewUrl" class="preview">
          <img :src="previewUrl" alt="preview" />
          <p class="file-name">{{ fileName }}</p>
        </div>
        <div v-else class="placeholder">
          <p class="plus">+</p>
          <p>点击选择图片</p>
        </div>
      </div>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <p v-if="taskId" class="success">已提交！taskId: {{ taskId }}</p>

      <div v-if="polling || (progress > 0 && !modelUrl)" class="progress-wrap">
        <div class="progress-bar">
          <div class="progress-inner" :style="{ width: progress + '%' }"></div>
        </div>
        <span class="progress-text">{{ stage === 'rig' ? '骨骼生成中' : '建模中' }} {{ progress }}%</span>
      </div>

      <div v-if="modelUrl" class="done-box">
        <img v-if="previewImg" :src="previewImg" alt="model preview" class="done-img" />
        <p class="done-text">3D 模型生成完成！</p>
        <p class="done-url">{{ modelUrl }}</p>
      </div>

      <div class="actions">
        <template v-if="modelUrl">
          <button class="btn-primary btn-enter" @click="$emit('enter')">
            {{ downloading ? '下载中…' : '进入场景' }}
          </button>
        </template>
        <template v-else>
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button
            class="btn-primary"
            :disabled="!fileBuffer || uploading || polling"
            @click="handleUpload"
          >
            {{ uploading ? '生成中…' : '生成 3D 模型' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.modal {
  width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 28px 28px 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  -webkit-app-region: no-drag;
  app-region: no-drag;

  h2 {
    margin: 0 0 6px;
    font-size: 20px;
    color: #222;
  }

  .tip {
    margin: 0 0 20px;
    font-size: 13px;
    color: #888;
  }
}

.drop-zone {
  border: 2px dashed #ccc;
  border-radius: 10px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  background: #fafafa;
  transition: border-color 0.2s;
  -webkit-app-region: no-drag;
  app-region: no-drag;

  &:hover {
    border-color: #42b883;
  }

  .placeholder {
    color: #aaa;
    text-align: center;

    .plus {
      font-size: 48px;
      line-height: 1;
      margin: 0 0 8px;
      color: #ccc;
    }

    p {
      margin: 0;
      font-size: 14px;
    }
  }

  .preview {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    img {
      max-width: 100%;
      max-height: 160px;
      object-fit: contain;
    }

    .file-name {
      margin: 6px 0 0;
      font-size: 12px;
      color: #888;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 90%;
    }
  }
}

.error {
  color: #e74c3c;
  font-size: 13px;
  margin: 12px 0 0;
}

.success {
  color: #27ae60;
  font-size: 13px;
  margin: 12px 0 0;
}

.progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 0;

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-inner {
    height: 100%;
    background: #42b883;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .progress-text {
    font-size: 12px;
    color: #666;
    min-width: 70px;
    text-align: right;
  }
}

.done-box {
  margin-top: 12px;
  text-align: center;

  .done-img {
    max-width: 100%;
    max-height: 140px;
    border-radius: 8px;
  }

  .done-text {
    margin: 8px 0 0;
    color: #27ae60;
    font-size: 14px;
    font-weight: bold;
  }

  .done-url {
    margin: 4px 0 0;
    font-size: 11px;
    color: #999;
    word-break: break-all;
  }
}

.resume-box {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border: 1px solid #eee;
  border-radius: 8px;

  p {
    margin: 0 0 4px;
    font-size: 13px;
    color: #555;
  }

  .resume-id {
    font-size: 11px;
    color: #999;
    word-break: break-all;
  }

  .resume-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;

  button {
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
  }

  .btn-cancel {
    background: #f0f0f0;
    color: #666;

    &:hover {
      background: #e6e6e6;
    }
  }

  .btn-primary {
    background: #42b883;
    color: #fff;

    &:hover:not(:disabled) {
      background: #3aa876;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-enter {
    width: 100%;
  }
}
</style>
