import * as wgpuutils from "https://cdn.jsdelivr.net/npm/webgpu-utils@1.9.2/dist/1.x/webgpu-utils.module.min.js"

export class RenderStuff{
	constructor(canvas){
		this.ctx = canvas.getContext('webgpu')
	}
	async init(){
		if(!navigator.gpu) throw new Error("No WebGPU. Either your computer or your web browser is bad")
		const adapter = await navigator.gpu.requestAdapter();
		if(!adapter) throw new Error("No WebGPU. It is your problem")
		const presentationFormat = adapter.features.has('bgra8unorm-storage') ? navigator.gpu.getPreferredCanvasFormat() : 'rgba8unorm';
		this.device = await adapter.requestDevice({
			requiredFeatures: presentationFormat === 'bgra8unorm' ? ['bgra8unorm-storage'] : [],
		});
		this.device.lost.then(function(i){
			reportError("It is lost. "+i.message)
		})
		this.ctx.configure({
			device:this.device,
			format: presentationFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
		});
	}
	create_compute_shader(source, entry_point, label){
		let shader = this.device.createShaderModule({
			label: label+" Compute Shader",
			code: source,
		});

		//for example: #multistep do_these: do_this, do_that
		let cap = source.match(new RegExp("#multistep "+entry_point+": (.*?)\\n"))
		
		let compute_pipelines = []
		if(!cap){
			console.log("single step");
			compute_pipelines.push(
				this.device.createComputePipeline({
					label: label+" Compute pipeline",
					layout: "auto",
					compute:{
						module: shader,
						entryPoint: entry_point,
					}
				})
			);
		}else{
			let multi_entry_point = cap[1].split(", ");
			console.log("multi step ", cap);
			for (let entry_point of multi_entry_point){
				compute_pipelines.push(
					this.device.createComputePipeline({
						label: label+" Compute pipeline",
						layout: "auto",
						compute:{
							module: shader,
							entryPoint: entry_point,
						}
					})
				)
			}
		}
		return {compute_pipelines, label, definitions: wgpuutils.makeShaderDataDefinitions(source)}
	}
	run_compute_shader({compute_pipelines, label}, buffers, size_x, size_y, size_z) {
		let encoder = this.device.createCommandEncoder({ label: label+" Compute Encoder" });
		let pass = encoder.beginComputePass({ label: label+" Compute Pass" });
		for (let compute_pipeline of compute_pipelines){
			let bi = 0;
			let bind_group = this.device.createBindGroup({
				layout: compute_pipeline.getBindGroupLayout(0),
				entries: buffers.map(buffer => ({
					binding: bi++,
					resource: {buffer: buffer},
				}))
			});
			pass.setPipeline(compute_pipeline);
			pass.setBindGroup(0, bind_group);
			pass.dispatchWorkgroups(size_x, size_y, size_z);
		}
		pass.end()
		this.device.queue.submit([encoder.finish()])
	}
	async read_buffer(a){
		let encoder = this.device.createCommandEncoder();
		let b = this.device.createBuffer({size:a.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
		encoder.copyBufferToBuffer(a,0,b,0,a.size)
		this.device.queue.submit([encoder.finish()])
		await this.device.queue.onSubmittedWorkDone()
		await b.mapAsync(GPUMapMode.READ)
		let data = new Uint32Array(b.getMappedRange()).slice()
		b.unmap()
		b.destroy()
		return data
	}
}