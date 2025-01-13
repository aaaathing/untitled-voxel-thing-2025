@group(0) @binding(0) var<storage, read_write> volumes: array<u32>;
@group(0) @binding(1) var<storage, read_write> allobjects: array<u32>;
@compute @workgroup_size(1)
fn main() {
  v_indices[0]++;
}