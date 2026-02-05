/**
 * Bookshelf Station - Library/reading station decorations
 */

import * as THREE from 'three'

export function addBookshelfDetails(group: THREE.Group): void {
  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a5a6a,  // Blue-gray metallic
    roughness: 0.6,
    metalness: 0.3,
  })

  // Vertical sides
  for (const xOffset of [-0.7, 0.7]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.5, 0.8),
      shelfMaterial
    )
    side.position.set(xOffset, 1.55, 0)
    side.castShadow = true
    group.add(side)
  }

  // Shelves
  for (const yOffset of [1.3, 1.8]) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.8),
      shelfMaterial
    )
    shelf.position.set(0, yOffset, 0)
    group.add(shelf)
  }

  // Books (simple colored boxes) - randomized order
  const bookColors = [
    0xa855f7,  // Purple
    0x000000,  // Black
    0xfbbf24,  // Yellow (bright)
    0xc084fc,  // Light Purple
    0xd97706,  // Darker Gold/Amber
  ]
  const bookLabels = ['ACTi', 'Unblinded', 'ACTi', 'Unblinded', 'ACTi']

  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color: bookColors[i] })
    )
    book.position.set(-0.4 + i * 0.2, 1.55, 0)
    group.add(book)

    // Add text label on the book spine as a plane mesh (not sprite)
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // Clear canvas
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw white text vertically
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 42px Cinzel, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Rotate and draw text
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(Math.PI / 2) // Rotate 90 degrees counter-clockwise for vertical text
    ctx.fillText(bookLabels[i], 0, 0)
    ctx.restore()

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true

    // Create a plane mesh for the text (stuck to book, not camera-facing)
    const textGeometry = new THREE.PlaneGeometry(0.14, 0.34)
    const textMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
    })
    const textMesh = new THREE.Mesh(textGeometry, textMaterial)
    textMesh.position.set(-0.4 + i * 0.2, 1.55, 0.26) // Slightly in front of book
    group.add(textMesh)
  }

  // Helper function to create a book with text label
  const createBook = (color: number, label: string, position: THREE.Vector3, rotation?: THREE.Euler) => {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color })
    )
    book.position.copy(position)
    if (rotation) book.rotation.copy(rotation)
    group.add(book)

    // Add text label
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 42px Cinzel, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(label, 0, 0)
    ctx.restore()

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true

    const textGeometry = new THREE.PlaneGeometry(0.14, 0.34)
    const textMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
    })
    const textMesh = new THREE.Mesh(textGeometry, textMaterial)
    textMesh.position.copy(position)
    if (rotation) textMesh.rotation.copy(rotation)
    textMesh.position.z += 0.26
    group.add(textMesh)
  }

  // Books on the station base (bottom)
  createBook(0xc084fc, 'Unblinded', new THREE.Vector3(-0.3, 0.23, 0.1)) // Light Purple
  createBook(0xa855f7, 'ACTi', new THREE.Vector3(0.1, 0.23, 0.1)) // Purple

  // Books on top of the bookshelf - spread out more
  createBook(0xfbbf24, 'ACTi', new THREE.Vector3(-0.35, 2.03, 0)) // Yellow standing (left)
  createBook(0xd97706, 'Unblinded', new THREE.Vector3(0.35, 2.03, 0)) // Darker Gold standing (right)

  // Fallen over book on top (center)
  const fallenBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.45, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x000000 }) // Black
  )
  fallenBook.position.set(0, 1.9, 0.1)
  fallenBook.rotation.set(0, 0, Math.PI / 2) // Fallen on its side
  group.add(fallenBook)

  // Text for fallen book - right-side up
  const fallenCanvas = document.createElement('canvas')
  fallenCanvas.width = 128
  fallenCanvas.height = 256
  const fallenCtx = fallenCanvas.getContext('2d')!

  fallenCtx.fillStyle = 'transparent'
  fallenCtx.fillRect(0, 0, fallenCanvas.width, fallenCanvas.height)

  fallenCtx.fillStyle = '#ffffff'
  fallenCtx.font = 'bold 42px Cinzel, serif'
  fallenCtx.textAlign = 'center'
  fallenCtx.textBaseline = 'middle'

  fallenCtx.save()
  fallenCtx.translate(fallenCanvas.width / 2, fallenCanvas.height / 2)
  fallenCtx.rotate(Math.PI / 2) // Rotate to make text right-side up when book is sideways
  fallenCtx.fillText('Unblinded', 0, 0)
  fallenCtx.restore()

  const fallenTexture = new THREE.CanvasTexture(fallenCanvas)
  fallenTexture.needsUpdate = true

  const fallenTextGeometry = new THREE.PlaneGeometry(0.14, 0.34)
  const fallenTextMaterial = new THREE.MeshBasicMaterial({
    map: fallenTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
  })
  const fallenTextMesh = new THREE.Mesh(fallenTextGeometry, fallenTextMaterial)
  fallenTextMesh.position.set(0, 1.9, 0.36)
  fallenTextMesh.rotation.set(0, 0, Math.PI / 2)
  group.add(fallenTextMesh)
}
