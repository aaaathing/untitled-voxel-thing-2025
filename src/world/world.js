import allobjects from "./allobjects.wgsl.js"
import moveit from "./moveit.wgsl.js"
export class World{
	constructor(renderStuff){
		this.renderStuff = renderStuff
		this.moveit = renderStuff.create_compute_shader(moveit+allobjects, "main")
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
}