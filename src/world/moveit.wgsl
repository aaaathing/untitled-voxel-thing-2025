//#multistep main: updateVel, updatePos

//struct update_attrs{
//  id: u32
//};

@group(0) @binding(0) var<storage, read_write> volumes: array<u32>;
@group(0) @binding(1) var<storage, read_write> allobjects: array<Object>;
@compute @workgroup_size(1)
fn updateVel(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  for(var i=0u; i<arrayLength(&allobjects); i++){
    if(i == idx){continue;}
    var dist = allobjects[idx].position - allobjects[i].position;
    dist /= pow(length(dist), 2.);
    allobjects[idx].velocity += dist;
  }
  _ = arrayLength(&volumes);
}
@group(0) @binding(0) var<storage, read_write> volumes2: array<u32>;
@group(0) @binding(1) var<storage, read_write> allobjects2: array<Object>;
@compute @workgroup_size(1)
fn updatePos(@builtin(global_invocation_id) id: vec3<u32>){
  let idx = id.x;
  allobjects2[idx].position += allobjects2[idx].velocity;
  for(var i=0u; i<arrayLength(&allobjects2); i++){
    if(i != idx && objects_collide(allobjects2[idx], allobjects2[i])){
      allobjects2[idx].position -= allobjects2[idx].velocity;
      allobjects2[idx].velocity = vec3f(0.);
      break;
    }
  }
  _ = arrayLength(&volumes2);
}
fn objects_collide(o1:Object, o2:Object) -> bool{ //simple
  return all(o1.position + o1.bounds_min < o2.position + o2.bounds_max) && all(o1.position + o1.bounds_max > o2.position + o2.bounds_min);
}