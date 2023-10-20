const { mat4, vec3, vec4 } = glMatrix

class Camera {
    constructor({target = [0, 0, 0], up = [0, 1, 0], camera = [], defaultCameraMode}) {
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
        this.freeFly = defaultCameraMode === 'freefly'

        // True when the camera moved and the splats need to be sorted
        this.needsWorkerUpdate = true

        // Keyboard state
        this.keyStates = {
            KeyW: false,
            KeyS: false,
            KeyA: false,
            KeyD: false,
            KeyQ: false,
            KeyE: false,
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

        // Rotate camera around target
        gl.canvas.addEventListener('mousemove', e => {
            if (!e.buttons) return
    
            this.phi += e.movementY * 0.01
            this.theta -= e.movementX * 0.01

            requestRender()
        })

        // Zoom in and out
        gl.canvas.addEventListener('wheel', e => {
            if (this.freeFly) return

            this.radius = Math.max(1, this.radius + e.deltaY * 0.01)

            requestRender()
        })

        // Free-fly movement
        document.addEventListener('keydown', e => {
            if (!this.freeFly || this.keyStates[e.code] == null) 
                return
            this.keyStates[e.code] = true
        })

        document.addEventListener('keyup', e => {
            if (!this.freeFly || this.keyStates[e.code] == null) 
                return
            this.keyStates[e.code] = false
        })

        // Update camera from mouse and keyboard inputs
        setInterval(this.updateKeys.bind(this), 1000/60)
    }

    // Reset parameters on new scene load
    setParameters({target = [0, 0, 0], up = [0, 1, 0], camera = [], defaultCameraMode}) {
        this.target = [...target]
        this.up = [...up]
        this.theta  = camera[0] ?? -Math.PI/2
        this.phi    = camera[1] ?? Math.PI/2
        this.radius = camera[2] ?? 3
        this.freeFly = defaultCameraMode === 'freefly'
        this.needsWorkerUpdate = true
        this.sceneRotationMatrix = rotateAlign(this.up, [0, 1, 0])
    }

    updateKeys() {
        if (Object.values(this.keyStates).every(s => !s)) return

        const front = this.getFront()
        const right = vec3.cross(this.right, front, this.up)

        if (this.keyStates.KeyW) vec3.add(this.target, this.target, vec3.scale(front, front, settings.speed))
        if (this.keyStates.KeyS) vec3.subtract(this.target, this.target, vec3.scale(front, front, settings.speed))
        if (this.keyStates.KeyA) vec3.add(this.target, this.target, vec3.scale(right, right, settings.speed))
        if (this.keyStates.KeyD) vec3.subtract(this.target, this.target, vec3.scale(right, right, settings.speed))
        if (this.keyStates.KeyQ) vec3.add(this.target, this.target, vec3.scale(vec3.create(), this.up, settings.speed))
        if (this.keyStates.KeyE) vec3.subtract(this.target, this.target, vec3.scale(vec3.create(), this.up, settings.speed))

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