<script setup lang="ts">
import { onMounted } from 'vue'
import * as THREE from 'three'
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const clock = new THREE.Clock()

function init() {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  })

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
    (gltf) => {
      console.log('aaa', 2)
      const box = new THREE.Box3().setFromObject(gltf)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      console.log('ssss', JSON.stringify(size))
      camera.position.set(0, size.z * 2, size.z * 5)
      camera.lookAt(0, size.z / 2, 0)
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
        console.log('动画数量:', gltf.animations.length)

        gltf.animations.forEach((animation, index) => {
          console.log(index, animation.name, animation.duration)
        })
        // gltf旋转y 180度
        gltf.rotation.y = Math.PI

        // 1. 创建动画混合器
        const mixer = new THREE.AnimationMixer(gltf)
        // @ts-ignore
        window.mixer = mixer
        scene.add(gltf)
        animate()
      })
    }
  )

  function animate() {
    requestAnimationFrame(animate)


    const delta = clock.getDelta()

    // @ts-ignore
    if (window.mixer) {
      // @ts-ignore
      window.mixer.update(delta)
    }

    renderer.render(scene, camera)
  }
}
function runAction(actionStr: string = 'cur_WigglingTail') {
  console.log('aaa', 4)
  // @ts-ignore
  const action = window.mixer.clipAction(actionStr)
  // @ts-ignore
  window.runningAction = action;
  if (action) {
    console.log('aaa', 5)
    action.timeScale = 0.5
    // 4. 播放
    console.log('aaa', 6)
    action.play()
  }
}
function stopRunningAction() {
  // @ts-ignore
  window.runningAction.stop()
}
// @ts-ignore
window.runAction = runAction
// @ts-ignore
window.stopRunningAction = stopRunningAction;
onMounted(() => {
  setTimeout(() => {
    init();
  }, 100)
})

function test() {
  // alert('test')
}
</script>

<template>
  <div class="out" @click="test">
    <div class="drag">drag</div>
    <div id="container">
    </div>
  </div>
</template>

<style scoped lang="less">
.out {
  width: 100vw;
  height: 100vh;

  .drag {
    -webkit-app-region: drag;
  }

}

#container {
  width: 100vw;
  height: 100vh;

  &:hover {
    background-color: rgba(43, 255, 0, 0.2);
  }
}
</style>
