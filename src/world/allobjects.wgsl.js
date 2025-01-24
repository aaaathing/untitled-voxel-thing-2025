export default /*wgsl*/`
struct Object {
	position: vec3f,
	bounds_min: vec3f,
	bounds_max: vec3f,
	velocity: vec3f,
	attributes: u32, //pointer
};

@group(0) @binding(0)
var<storage, read_write> allobjects0: array<Object>;
@compute @workgroup_size(1)
fn rebuild(){
	//todo
}
`