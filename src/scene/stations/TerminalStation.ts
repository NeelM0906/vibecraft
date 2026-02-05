/**
 * Terminal Station - Computer/CLI station decorations
 */

import * as THREE from 'three'

export function addTerminalDetails(group: THREE.Group): void {
  // CRT Monitor frame
  const frameGeometry = new THREE.BoxGeometry(1.1, 0.8, 0.3)
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a35,
    roughness: 0.8,
  })
  const frame = new THREE.Mesh(frameGeometry, frameMaterial)
  frame.position.set(0, 1.2, -0.25)
  frame.rotation.x = -0.15
  frame.castShadow = true
  group.add(frame)

  // Screen inset
  const screenGeometry = new THREE.PlaneGeometry(0.85, 0.55)
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a0a12,
    emissive: 0x112244,
    emissiveIntensity: 0.3,
  })
  const screen = new THREE.Mesh(screenGeometry, screenMaterial)
  screen.position.set(0, 1.22, -0.08)
  screen.rotation.x = -0.15
  group.add(screen)

  // Terminal text "$ _" using a small plane with green tint
  const promptGeometry = new THREE.PlaneGeometry(0.15, 0.08)
  const promptMaterial = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.9,
  })
  const prompt = new THREE.Mesh(promptGeometry, promptMaterial)
  prompt.position.set(-0.25, 1.18, -0.06)
  prompt.rotation.x = -0.15
  group.add(prompt)

  // Keyboard
  const keyboardGeometry = new THREE.BoxGeometry(0.7, 0.03, 0.25)
  const keyboardMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a22,
    roughness: 0.7,
  })
  const keyboard = new THREE.Mesh(keyboardGeometry, keyboardMaterial)
  keyboard.position.set(-0.1, 0.83, 0.2)
  group.add(keyboard)

  // Mouse
  // Mouse body (rounded shape)
  const mouseBodyGeometry = new THREE.BoxGeometry(0.08, 0.04, 0.12)
  const mouseBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a35,
    roughness: 0.6,
  })
  const mouseBody = new THREE.Mesh(mouseBodyGeometry, mouseBodyMaterial)
  mouseBody.position.set(0.35, 0.85, 0.15)
  group.add(mouseBody)

  // Mouse buttons (two small boxes)
  const mouseButtonGeometry = new THREE.BoxGeometry(0.035, 0.01, 0.05)
  const mouseButtonMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a22,
    roughness: 0.7,
  })

  // Left button
  const leftButton = new THREE.Mesh(mouseButtonGeometry, mouseButtonMaterial)
  leftButton.position.set(0.33, 0.87, 0.12)
  group.add(leftButton)

  // Right button
  const rightButton = new THREE.Mesh(mouseButtonGeometry, mouseButtonMaterial)
  rightButton.position.set(0.37, 0.87, 0.12)
  group.add(rightButton)

  // Scroll wheel (small cylinder)
  const scrollWheelGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8)
  const scrollWheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.5,
  })
  const scrollWheel = new THREE.Mesh(scrollWheelGeometry, scrollWheelMaterial)
  scrollWheel.position.set(0.35, 0.88, 0.135)
  scrollWheel.rotation.x = Math.PI / 2
  group.add(scrollWheel)
}
