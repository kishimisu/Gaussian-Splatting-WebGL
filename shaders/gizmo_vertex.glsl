#version 300 es
in vec3 a_pos;

out vec2 coord;
out float isPlane;

uniform mat4 projmatrix;
uniform float draw_plane;

void main() {
    vec4 pos = projmatrix * vec4(a_pos, 1.0);
    vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.;

    corner *= 1. - draw_plane;
    isPlane = draw_plane;
    coord = a_pos.xz / 10.;

    gl_Position = pos + vec4(corner, 0.0, 0.0)*.2;
}