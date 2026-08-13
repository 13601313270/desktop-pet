<script setup lang="ts">
import { onMounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

onMounted(() => {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )

  camera.position.set(0, 1, 5)

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

  document
    .getElementById('ccc')!
    .appendChild(renderer.domElement)

  const light = new THREE.DirectionalLight(
    0xffffff,
    3
  )

  light.position.set(3, 5, 5)

  scene.add(light)

  const ambient = new THREE.AmbientLight(
    0xffffff,
    1
  )

  scene.add(ambient)

  const loader = new GLTFLoader()

  loader.load(
    '/pets/dog.glb',
    (gltf) => {
      scene.add(gltf.scene)
    }
  )

  function animate() {
    requestAnimationFrame(animate)

    renderer.render(scene, camera)
  }

  animate()
})
</script>

<template>
  <div id="ccc">
  </div>
</template>

<style scoped lang="less">
#ccc {
  width: 100vw;
  height: 100vh;
  background-color: red;
  -webkit-app-region: drag;
}
</style>
