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

  const light = new THREE.DirectionalLight(0xffffff, 3)
  scene.add(light)
  const ambient = new THREE.AmbientLight(0xffffff, 1)

  scene.add(ambient)
  const loader = new FBXLoader()
  console.log('aaa', 1)
  loader.load(
    '/pets/cur.fbx',
    (gltf_) => {
      gltf = gltf_;
      gltfBac = clone(gltf_) as any;
      console.log('aaa', 2)
      const box = new THREE.Box3().setFromObject(gltf)
      const size = box.getSize(new THREE.Vector3())
      console.log('ssss', JSON.stringify(size))
      camera.position.set(0, size.z * 1.5, size.z * 3)
      camera.lookAt(0, 0, 0)
      light.position.set(10, 50, 0)
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load('/pets/cur.png', (texture) => {
        console.log('aaa', 3)
        gltf.traverse((child) => {
          // @ts-ignore
          if (child.isMesh) {
            // @ts-ignore
            const material = child.material
            if (material.map) {
              material.map.dispose()
            }
            material.map = texture
            material.needsUpdate = true
          }
        })
        gltf.animations.forEach((animation) => {
          // console.log('animation', animation);
          const title = ({
            cur_WigglingTail: '摇尾巴',
            cur_Walking01: '走路',
            cur_Running: '跑',
            cur_Walking02: '快走',
            cur_NoAction: '停止',
            cur_Eating: '吃东西',
            cur_Angry: '生气',
            cur_Sitting: '坐下',
            cur_Breathing: '站着喘气'
          })[animation.name]
          allAnimationList.value.push({
            name: animation.name,
            title: title || animation.name,
          })
        })
        // gltf旋转y 180度
        gltf.rotation.y = Math.PI / 4 * 3
        gltf.position.y = 0;

        // 1. 创建动画混合器
        mixer = new THREE.AnimationMixer(gltf)
        scene.add(gltf)

        gltfBac.position.x = 10000;
        gltfBac.rotation.y = Math.PI
        mixerBac = new THREE.AnimationMixer(gltfBac)
        scene.add(gltfBac)
        animate()
      })
    }
  )

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
