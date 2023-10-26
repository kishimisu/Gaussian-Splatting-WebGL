const { mat4, vec3, vec4 } = glMatrix

class Camera {
    constructor({target = [0, 0, 0], up = [0, 1, 0], camera = [], defaultCameraMode} = {}) {
        this.target = [...target] // Position of look-at target
        this.up = [...up]         // Up vector

        // Camera spherical coordinates (around the target)
        this.theta  = camera[0] ?? -Math.PI/2
        this.phi    = camera[1] ?? Math.PI/2
        this.radius = camera[2] ?? 3

        // Y Field of view
        this.fov_y = 0.820176

        // False: orbit around object (mouse + wheel)
        // True: free-fly (mouse + AWSD)
        this.freeFly = settings.freeFly = defaultCameraMode !== 'orbit'

        // Indicate that the camera moved and the splats need to be sorted
        this.needsWorkerUpdate = true

        // Is the user dragging the mouse?
        this.isDragging = false

        // Disable user input
        this.disableMovement = false

        // Enable ray cast for camera calibration
        this.isCalibrating = false
        this.calibrationPoints = []

        // Keyboard state
        this.keyStates = {
            KeyW: false,
            KeyS: false,
            KeyA: false,
            KeyD: false,
            ShiftLeft: false,
            Space: false
        }

        // Helper vectors
        this.pos = vec3.create()
        this.front = vec3.create()
        this.right = vec3.create()        

        // Helper matrices
        this.viewMatrix = mat4.create()
        this.projMatrix = mat4.create()
        this.viewProjMatrix = mat4.create()
        this.lastViewProjMatrix = mat4.create()
        this.sceneRotationMatrix = rotateAlign(this.up, [0, 1, 0])

        // Matrices sent to the GPU
        this.vm = mat4.create()
        this.vpm = mat4.create()

        // Rotate camera around target (mouse)
        gl.canvas.addEventListener('mousemove', e => {
            if (!e.buttons || this.disableMovement) return

            this.theta -= e.movementX * 0.01 * .5
            this.phi = Math.max(1e-6, Math.min(Math.PI - 1e-6, this.phi + e.movementY * 0.01 * .5))
            this.isDragging = true

            requestRender()
        })

        // Rotate camera around target (touch)
        const lastTouch = {}
        gl.canvas.addEventListener('touchstart', e => {
            e.preventDefault()
            if (e.touches.length == 0 || this.disableMovement) return

            lastTouch.clientX = e.touches[0].clientX
            lastTouch.clientY = e.touches[0].clientY
        })
        gl.canvas.addEventListener('touchmove', e => {
            e.preventDefault()
            if (e.touches.length == 0 || this.disableMovement) return

            const touch = e.touches[0]
            const movementX = touch.clientX - lastTouch.clientX
            const movementY = touch.clientY - lastTouch.clientY
            lastTouch.clientX = touch.clientX
            lastTouch.clientY = touch.clientY

            this.theta -= movementX * 0.01 * .5 * .3
            this.phi = Math.max(1e-6, Math.min(Math.PI - 1e-6, this.phi + movementY * 0.01 * .5))

            requestRender()
        })

        // Zoom in and out
        gl.canvas.addEventListener('wheel', e => {
            if (this.freeFly || this.disableMovement) return

            this.radius = Math.max(1, this.radius + e.deltaY * 0.01)

            requestRender()
        })

        // Free-fly movement
        document.addEventListener('keydown', e => {
            if (!this.freeFly || this.disableMovement || this.keyStates[e.code] == null) 
                return
            this.keyStates[e.code] = true
        })

        document.addEventListener('keyup', e => {
            if (!this.freeFly || this.disableMovement || this.keyStates[e.code] == null) 
                return
            this.keyStates[e.code] = false
        })

        // Gizmo event
        gl.canvas.addEventListener('mouseup', e => {
            if (this.isDragging) {
                this.isDragging = false
                return
            }
            if (this.disableMovement || !this.isCalibrating) return

            this.raycast(e.clientX, e.clientY)
        })

        // Update camera from mouse and keyboard inputs
        setInterval(this.updateKeys.bind(this), 1000/60)
    }

    // Reset parameters on new scene load
    setParameters({target = [0, 0, 0], up = [0, 1, 0], camera = [], defaultCameraMode} = {}) {
        this.target = [...target]
        this.up = [...up]
        this.theta  = camera[0] ?? -Math.PI/2
        this.phi    = camera[1] ?? Math.PI/2
        this.radius = camera[2] ?? 3
        this.freeFly = settings.freeFly = defaultCameraMode !== 'orbit'
        this.needsWorkerUpdate = true
        this.sceneRotationMatrix = rotateAlign(this.up, [0, 1, 0])
        camController.resetCalibration()
    }

    updateKeys() {
        if (Object.values(this.keyStates).every(s => !s) || this.disableMovement) return

        const front = this.getFront()
        const right = vec3.cross(this.right, front, this.up)

        if (this.keyStates.KeyW) vec3.add(this.target, this.target, vec3.scale(front, front, settings.speed))
        if (this.keyStates.KeyS) vec3.subtract(this.target, this.target, vec3.scale(front, front, settings.speed))
        if (this.keyStates.KeyA) vec3.add(this.target, this.target, vec3.scale(right, right, settings.speed))
        if (this.keyStates.KeyD) vec3.subtract(this.target, this.target, vec3.scale(right, right, settings.speed))
        if (this.keyStates.ShiftLeft) vec3.add(this.target, this.target, vec3.scale(vec3.create(), this.up, settings.speed))
        if (this.keyStates.Space) vec3.subtract(this.target, this.target, vec3.scale(vec3.create(), this.up, settings.speed))

        requestRender()
    }

    getPos(radius = this.radius) {
        const pos = [
            radius * Math.sin(this.phi) * Math.cos(this.theta),
            radius * Math.cos(this.phi),
            radius * Math.sin(this.phi) * Math.sin(this.theta)
        ]

        return vec3.transformMat3(pos, pos, this.sceneRotationMatrix)
    }

    getFront() {
        const front = vec3.subtract(this.front, [0,0,0], this.getPos())
        vec3.normalize(front, front)
        return front
    }

    update() {
        // Update current position
        vec3.add(this.pos, this.target, this.getPos(this.freeFly ? 1 : this.radius))

        // Create a lookAt view matrix
        mat4.lookAt(this.viewMatrix, this.pos, this.target, this.up)

        // Create a perspective projection matrix
        const aspect = gl.canvas.width / gl.canvas.height
        mat4.perspective(this.projMatrix, this.fov_y, aspect, 0.1, 100)

		// Convert view and projection to target coordinate system
        // Original C++ reference: https://gitlab.inria.fr/sibr/sibr_core/-/blob/gaussian_code_release_union/src/projects/gaussianviewer/renderer/GaussianView.cpp#L464
        mat4.copy(this.vm, this.viewMatrix)
        mat4.multiply(this.vpm, this.projMatrix, this.viewMatrix)

        invertRow(this.vm, 1)
        invertRow(this.vm, 2)
        invertRow(this.vpm, 1)

        // (Webgl-specific) Invert x-axis
        invertRow(this.vm, 0)
        invertRow(this.vpm, 0)

        this.updateWorker()
    }

    updateWorker() {
        // Calculate the dot product between last and current view-projection matrices
        // If they differ too much, the splats need to be sorted
        const dot = this.lastViewProjMatrix[2]  * this.vpm[2] 
                  + this.lastViewProjMatrix[6]  * this.vpm[6]
                  + this.lastViewProjMatrix[10] * this.vpm[10]
        if (Math.abs(dot - 1) > 0.01) {
            this.needsWorkerUpdate = true
            mat4.copy(this.lastViewProjMatrix, this.vpm)
        }

        // Sort the splats as soon as the worker is available
        if (this.needsWorkerUpdate && !isWorkerSorting) {
            this.needsWorkerUpdate = false
            isWorkerSorting = true
            worker.postMessage({
                viewMatrix:  this.vpm, 
                maxGaussians: settings.maxGaussians,
                sortingAlgorithm: settings.sortingAlgorithm
            })
        }
    }

    raycast(x, y) {
        if (this.calibrationPoints.length >= 3) return
        
        // Calculate ray direction from mouse position
        const Px = (x / window.innerWidth * 2 - 1)
        const Py = -(y / window.innerHeight * 2 - 1)
        const cameraToWorld = mat4.invert(mat4.create(), this.vpm)
        const rayOriginWorld = vec3.transformMat4(vec3.create(), this.pos, cameraToWorld)
        const rayPWorld = vec3.transformMat4(vec3.create(), [Px, Py, 1], cameraToWorld)
        const rd = vec3.subtract(vec3.create(), rayPWorld, rayOriginWorld)
        vec3.normalize(rd, rd)

        // Raycast the gaussian splats
        const hit = { id: -1, dist: 1e9 }
        for (let i = 0; i < gaussianCount; i++) {
            const pos = positionData.slice(i * 3, i * 3 + 3)
            const alpha = opacityData[i]

            if (alpha < 0.1) continue

            const t = raySphereIntersection(this.pos, rd, pos, 0.1)

            if (t > 0.4 && t < hit.dist) {
                hit.id = i
                hit.dist = t
            }
        }

        if (hit.id == -1) return null

        const hitPosition = vec3.add(vec3.create(), this.pos, vec3.scale(vec3.create(), rd, hit.dist))
        this.calibrationPoints.push(hitPosition)

        // Update gizmo renderer
        gizmoRenderer.setPlaneVertices(...this.calibrationPoints)
        requestRender()

        return rd
    }

    resetCalibration() {
        this.isCalibrating = false
        this.calibrationPoints = []
        gizmoRenderer.setPlaneVertices()
    }

    finishCalibration() {
        this.isCalibrating = false
        this.calibrationPoints = []
        cam.up = gizmoRenderer.planeNormal
        cam.sceneRotationMatrix = rotateAlign(gizmoRenderer.planeNormal, [0, 1, 0])
        requestRender()
    }
}

const invertRow = (mat, row) => {
    mat[row + 0] = -mat[row + 0]
    mat[row + 4] = -mat[row + 4]
    mat[row + 8] = -mat[row + 8]
    mat[row + 12] = -mat[row + 12]
}

// Calculate the rotation matrix that aligns v1 with v2
// https://gist.github.com/kevinmoran/b45980723e53edeb8a5a43c49f134724
function rotateAlign(v1, v2) {
    const axis = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    const cosA = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]
    const k = 1.0 / (1.0 + cosA)
  
    const result = [
      (axis[0] * axis[0] * k) + cosA, (axis[1] * axis[0] * k) - axis[2], (axis[2] * axis[0] * k) + axis[1],
      (axis[0] * axis[1] * k) + axis[2], (axis[1] * axis[1] * k) + cosA, (axis[2] * axis[1] * k) - axis[0],
      (axis[0] * axis[2] * k) - axis[1], (axis[1] * axis[2] * k) + axis[0], (axis[2] * axis[2] * k) + cosA
    ]
  
    return result
}

// Calculate the intersection distance between a ray and a sphere
// Return -1 if no intersection
const raySphereIntersection = (rayOrigin, rayDirection, sphereCenter, sphereRadius) => {
    const oc = vec3.subtract(vec3.create(), rayOrigin, sphereCenter)
    const a = vec3.dot(rayDirection, rayDirection)
    const b = 2 * vec3.dot(oc, rayDirection)
    const c = vec3.dot(oc, oc) - sphereRadius * sphereRadius
    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) return -1
    return (-b - Math.sqrt(discriminant)) / (2 * a)
}