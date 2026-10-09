<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { sleep } from '../utils/sleep';

const clock = new THREE.Clock()

let mixer: THREE.AnimationMixer;
let mixerBac: THREE.AnimationMixer;
let runningAction: any;
let gltf: THREE.Group<THREE.Object3DEventMap>;
let gltfBac: THREE.Group<THREE.Object3DEventMap>;

/**
* 角度最短路径线性插值
* 确保从 start 到 end 走的是圆周上较近的旋转方向
*/
function lerpAngle(start: number, end: number, t: number): number {
  let diff = end - start
  if (diff > Math.PI) {
    diff -= Math.PI * 2
  } else if (diff < -Math.PI) {
    diff += Math.PI * 2
  }
  return start + diff * t
}

function capturePose(model: THREE.Group<THREE.Object3DEventMap>) {
  const pose: {
    [key in string]: any
  } = {}
  model.traverse((obj: any) => {
    if (obj.isBone) {
      pose[obj.name] = {
        position: obj.position.clone(),
        rotation: obj.rotation.clone(),
        quaternion: obj.quaternion.clone(),
        scale: obj.scale.clone()
      }
    }
  })
  return pose
}

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
})

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)

const scene = new THREE.Scene()

function blendPose(
  model: THREE.Group<THREE.Object3DEventMap>,
  fromPose: {
    [x: string]: any;
  },
  toPose: {
    [x: string]: any;
  },
  progress: number
) {
  model.traverse((obj) => {
    // @ts-ignore
    if (!obj.isBone) return
    const from = fromPose[obj.name]
    const to = toPose[obj.name]
    if (!from || !to) return
    console.log('sssss', obj.name, from.rotation.x, to.rotation.x)
    obj.position.set(
      from.position.x + (to.position.x - from.position.x) * progress,
      from.position.y + (to.position.y - from.position.y) * progress,
      from.position.z + (to.position.z - from.position.z) * progress
    )
    obj.rotation.set(
      lerpAngle(from.rotation.x, to.rotation.x, progress),
      lerpAngle(from.rotation.y, to.rotation.y, progress),
      lerpAngle(from.rotation.z, to.rotation.z, progress),
    )
  })
  renderer.render(scene, camera)
}

const allAnimationList = ref<{
  name: string;
  title: string;
}[]>([]);

function init() {
  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  )

  renderer.setPixelRatio(window.devicePixelRatio)

  renderer.setClearColor(0x000000, 0)

  document.getElementById('container')!.appendChild(renderer.domElement)

  // 主光源（上方偏前）
  const light = new THREE.DirectionalLight(0xffffff, 2.5)
  scene.add(light)
  // 正面补光，消除背光面全黑
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.5)
  fillLight.position.set(0, 2, 5)
  scene.add(fillLight)
  // 环境光提亮整体
  const ambient = new THREE.AmbientLight(0xffffff, 2)
  scene.add(ambient)
  // 半球光：天空色到地面色渐变，模拟自然光
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5)
  hemi.position.set(0, 5, 0)
  scene.add(hemi)
  const loader = new FBXLoader()
  console.log('aaa', 1)
  Promise.all([
    new Promise(resolve => {
      loader.load(
        '/pets/cur.fbx',
        (curObj) => {
          resolve(curObj)
        }
      )
    }),
    new Promise(resolve => {
      loader.load(
        '/pets/newDog.fbx',
        (curObj) => {
          resolve(curObj)
        }
      )
    })
  ]).then(([curObj, newDog]: any) => {
    gltf = newDog;
    gltfBac = clone(curObj) as any;

    // 先对原始模型做变换（旋转）
    gltf.rotation.y = Math.PI / 4 * 3

    // 计算模型包围盒，按最大边缩放到 ~2 单位
    const box = new THREE.Box3().setFromObject(gltf)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    console.log('model size:', size.toArray(), 'center:', center.toArray())

    const targetSize = 2
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = targetSize / maxDim
    gltf.scale.setScalar(scale)
    gltfBac.scale.setScalar(scale)

    // 缩完再算一次中心，把模型脚底对齐到 y=0
    const box2 = new THREE.Box3().setFromObject(gltf)
    const center2 = box2.getCenter(new THREE.Vector3())
    const newSize = box2.getSize(new THREE.Vector3())
    gltf.position.y -= box2.min.y  // 脚底对齐 y=0
    gltf.position.x -= center2.x
    gltf.position.z -= center2.z

    // 相机放到合适位置：在模型正前方偏上
    const dist = targetSize * 2
    camera.position.set(0, targetSize * 0.7, dist)
    camera.lookAt(0, targetSize * 0.4, 0)
    light.position.set(dist * 0.5, targetSize * 3, dist)
    fillLight.position.set(0, targetSize * 0.5, dist * 1.5)

    // 1. 创建动画混合器
    mixer = new THREE.AnimationMixer(gltf)
    scene.add(gltf)

    gltfBac.position.x = 10000
    mixerBac = new THREE.AnimationMixer(gltfBac)
    scene.add(gltfBac)
    animate()
  })

  function animate() {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    if (mixer) {
      mixer.update(delta)
    }
    renderer.render(scene, camera)
  }
}
async function runAction(actionStr: string) {
  const action = mixer.clipAction(actionStr)
  const actionBac = mixerBac.clipAction(actionStr)
  if (action && actionBac) {
    const ss = (new Date()).getTime();
    // 1. 先记录当前骨骼姿态

    const fromPose = capturePose(gltf)
    if (runningAction) {
      runningAction.paused = true;
    }

    // 2. 让动画停在第一帧，但不要马上播放
    actionBac.reset()
    actionBac.play()
    // 让 mixer 计算第一帧
    mixerBac.setTime(0)
    actionBac.paused = true
    // 3. 获取动画第一帧姿态
    const toPose = capturePose(gltfBac)
    action.stop();

    console.log('aaa333', (new Date()).getTime() - ss, JSON.stringify(fromPose) === JSON.stringify(toPose))

    // 4. 恢复正常
    action.paused = false
    await sleep(20)
    if (runningAction) {
      runningAction.stop();
    }
    blendPose(gltf, fromPose, toPose, 0.1)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.2)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.3)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.4)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.5)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.6)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.7)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.8)
    await sleep(20)
    blendPose(gltf, fromPose, toPose, 0.9)
    // await sleep(1000)
    // action.timeScale = 0.1
    // 4. 播放
    if (actionStr === 'cur_Sitting') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
    }
    action.play()
    runningAction = action;
  }
}
// @ts-ignore
window.runningAction = () => { return runningAction; }
function stopRunningAction() {
  runningAction.stop()
}
window.runAction = runAction
window.stopRunningAction = stopRunningAction;
onMounted(() => {
  setTimeout(() => {
    init();
  }, 200)
})

function test(e: MouseEvent) {
  const { clientX, clientY } = e;
  console.log('e', clientX, clientY)
  if (clientX > window.innerWidth / 2) {
    // gltf.rotation.y = Math.PI / 2
  }
}
</script>

<template>
  <div class="out" @click="test">
    <!-- <div class="drag">drag</div> -->
    <div class="actionList">
      <div v-for="item in allAnimationList" class="action" @click="runAction(item.name)">
        {{ item.title }}
      </div>
    </div>
    <div id="container">
    </div>
  </div>
</template>

<style scoped lang="less">
.out {
  width: 100vw;
  height: 100vh;

  .drag {
    position: absolute;
    -webkit-app-region: drag;
  }

  .actionList {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;

    .action {
      border: solid 1px black;
      background-color: white;
      border-radius: 2px;
      padding: 4px;
      cursor: pointer;
    }
  }
}

#container {
  width: 100vw;
  height: 100vh;
  -webkit-app-region: drag;

  &:hover {
    background-color: rgba(43, 255, 0, 0.2);
  }
}
</style>
