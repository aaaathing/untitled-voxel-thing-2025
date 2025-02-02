class PObject{
	x;y;z
	bounds_min_x;bounds_min_y;bounds_min_z
	bounds_max_x;bounds_max_y;bounds_max_z
	vel_x;vel_y;vel_z
	volume
}

export class World{
	objects = []
	constructor(parallelizer){
		this.collide = parallelizer.create([PObject], function(x,y,z,allObjects,o1,o2){
			type(o1, PObject, allObjects)
			type(o2, PObject, allObjects)
			let otherX = Math.floor(o1.x+o1.bounds_min_x+x - o2.x-o2.bounds_min_x)
			let otherY = Math.floor(o1.y+o1.bounds_min_y+y - o2.y-o2.bounds_min_y)
			let otherZ = Math.floor(o1.z+o1.bounds_min_z+z - o2.z-o2.bounds_min_z)
			if(o1.volume.get(x,y,z) && o2.volume.get(otherX,otherY,otherZ)){
				o1.vel_x = 0, o1.vel_y = 0, o1.vel_z = 0
				o2.vel_x = 0, o2.vel_y = 0, o2.vel_z = 0
			}
		})
	}
	async tick(){
		for(let i=0;i<this.objects.length; i++)for(let j=0;j<this.objects.length; j++){
			if(objects_collide(this.objects[i],this.objects[j])){
				let o = this.objects[i]
				this.collide(o.bounds_max_x-o.bounds_min_x,o.bounds_max_y-o.bounds_min_y,o.bounds_max_z-o.bounds_min_z, o,this.objects[j])
			}
		}
	}
}
function objects_collide(o1, o2){ //simple
  return o1.x + o1.bounds_min_x < o2.x + o2.bounds_max_x && o1.y + o1.bounds_min_y < o2.y + o2.bounds_max_y && o1.z + o1.bounds_min_z < o2.z + o2.bounds_max_z
	&& o1.x + o1.bounds_max_x > o2.x + o2.bounds_min_x && o1.y + o1.bounds_max_y > o2.y + o2.bounds_min_y && o1.z + o1.bounds_max_z > o2.z + o2.bounds_min_z
}

/*
import allobjects from "./allobjects.wgsl.js"
import moveit from "./moveit.wgsl.js"
export class World{
	constructor(renderStuff){
		this.renderStuff = renderStuff
		this.moveit = renderStuff.create_compute_shader(moveit, "main")
		this.volume_buffer = renderStuff.device.createBuffer({
			size:4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
		})
		this.allobjects_buffer = renderStuff.device.createBuffer({
			size: this.moveit.definitions.structs.Object.size*2,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
		})
	}
	async tick(){
		this.renderStuff.run_compute_shader(this.moveit, [this.volume_buffer,this.allobjects_buffer], this.allobjects_buffer.size/this.moveit.definitions.structs.Object.size)
		await this.renderStuff.device.queue.onSubmittedWorkDone()
	}
}*/