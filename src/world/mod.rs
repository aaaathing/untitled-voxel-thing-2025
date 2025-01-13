use range_alloc::RangeAllocator;
//https://docs.rs/range-alloc/0.1.3/range_alloc/struct.RangeAllocator.html

struct World{
	state: &State,
	volume_allocator: RangeAllocator,
	volume_buffer: &wgpu::Buffer,
	allobjects_buffer: &wgpu::Buffer,
	moveit_computeshader: ComputeShader,
	rebuild_computeshader: ComputeShader
}
impl World{
	pub fn new(state: &State) -> World{
		World{
			state,
			RangeAllocator::new(),
			&state.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
				label: Some("volume_buffer"),
				contents: &[100],
				usage: wgpu::BufferUsages::STORAGE
						| wgpu::BufferUsages::COPY_DST
						| wgpu::BufferUsages::COPY_SRC,
			}),
			&state.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
				label: Some("allobjects_buffer"),
				contents: &[100],
				usage: wgpu::BufferUsages::STORAGE
						| wgpu::BufferUsages::COPY_DST
						| wgpu::BufferUsages::COPY_SRC,
			}),
			state.create_compute_shader(include_str!("moveit.wgsl")+include_str!("bvh.wgsl"), "main"),
			state.create_compute_shader(include_str!("bvh.wgsl"), "rebuild")
		}
	}
	pub fn tick(&self){
		self.state.run_compute_shader(&self.moveit_computeshader, [&self.volume_buffer, &self.allobjects_buffer]);
		self.state.run_compute_shader(&self.rebuild_computeshader, [&self.allobjects_buffer]);
	}
}