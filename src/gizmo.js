class GizmoRenderer {
    async init() {
        const vertexShaderSource = await fetchFile('shaders/gizmo_vertex.glsl')
        const fragmentShaderSource = await fetchFile('shaders/gizmo_fragment.glsl')

        this.program = createProgram(gl, vertexShaderSource, fragmentShaderSource)
        this.buffer = gl.createBuffer()

        this.planeVertices = []
    }

    // Construct a plane from 3 vertices
    setPlaneVertices(v1 = [], v2 = [], v3 = []) {
        // Return if there are not enough vertices
        if (v1.length * v2.length * v3.length === 0) {
            this.planeVertices = new Float32Array([...v1, ...v2, ...v3])
            return
        }

        // Update GUI
        if (camController.p.textContent !== camController.texts['calibrated']) {
            camController.p.textContent = camController.texts['calibrated']
            camController.finish.enable()
        }
        
        // Calculate center of selection
        const center = vec3.add(vec3.create(), v1, vec3.add(vec3.create(), v2, v3))
        vec3.scale(center, center, 1 / 3)

        // Calculate normal vector and 2 orthogonal vectors
        const normal = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), vec3.subtract(vec3.create(), v2, v1), vec3.subtract(vec3.create(), v3, v1)))
        const u = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), v2, v1))
        const v = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), normal, u))
        
        // Rotate orthogonal vectors by 45 degree along the normal
        const rotM = mat4.fromRotation(mat4.create(), Math.PI/4, normal)
        vec3.transformMat4(u, u, rotM)
        vec3.transformMat4(v, v, rotM)

        // Calculate 4 vertices to form a square
        const scale = 15
        vec3.add(v1, center, vec3.scale(vec3.create(), u, -scale))
        vec3.add(v2, center, vec3.scale(vec3.create(), v, scale))
        vec3.add(v3, center, vec3.scale(vec3.create(), v, -scale))
        const v4 = vec3.add(vec3.create(), center, vec3.scale(vec3.create(), u, scale))

        this.planeVertices = new Float32Array([...v1, ...v2, ...v3, ...v4])
        this.planeNormal = normal
        if (this.planeNormal[2] < 0) vec3.scale(this.planeNormal, this.planeNormal, -1)        
    }

    render() {
        if (!settings.showGizmo || this.planeVertices.length === 0) return

        gl.useProgram(this.program)

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
        gl.bufferData(gl.ARRAY_BUFFER, this.planeVertices, gl.DYNAMIC_DRAW)
        
        const positionAttributeLocation = gl.getAttribLocation(this.program, "a_pos")
        gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0)

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'projmatrix'), false, cam.vpm)

        const cornerCount = this.planeVertices.length / 3
        const drawCorners = cornerCount < 4
        gl.uniform1f(gl.getUniformLocation(this.program, 'draw_plane'), drawCorners ? 0 : 1)
        gl.uniform1f(gl.getUniformLocation(this.program, 'aspect'), gl.canvas.width / gl.canvas.height)

        if (drawCorners) {
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.planeVertices.length / 3)
        }
        else {
            gl.vertexAttribDivisor(positionAttributeLocation, 0)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        }        
        
        // Undo WebGL state changes
        gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0)
        gl.vertexAttribDivisor(positionAttributeLocation, 1)
    }
}