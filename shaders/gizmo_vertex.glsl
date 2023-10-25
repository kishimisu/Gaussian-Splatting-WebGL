#version 300 es
precision mediump float;

in vec3 a_pos;

out vec2 coord;
out float isPlane;

uniform mat4 projmatrix;
uniform float draw_plane;
uniform float aspect;

void main() {
    vec4 pos = projmatrix * vec4(a_pos, 1.0);
    vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.;
    corner *= .2;

    isPlane = draw_plane;
    coord = corner;
    corner *= 1. - draw_plane;

    gl_Position = pos + vec4(corner * vec2(1, aspect), 0.0, 0.0);
}