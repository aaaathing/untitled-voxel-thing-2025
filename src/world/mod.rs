use range_alloc::RangeAllocator;
use crate::{State,ComputeShader};
//https://docs.rs/range-alloc/0.1.3/range_alloc/struct.RangeAllocator.html

pub struct World{
	volume_allocator: RangeAllocator<u32>,
	volume_buffer: wgpu::Buffer,
	allobjects_buffer: wgpu::Buffer,
	moveit_computeshader: ComputeShader,
	rebuild_computeshader: ComputeShader
}
impl World{
	pub fn new<'a>(state: &'a State<'a>) -> World{
		World{
			volume_allocator: RangeAllocator::new(0..100),//todo
			volume_buffer: state.device.create_buffer(&wgpu::BufferDescriptor {
				label: Some("volume_buffer"),
				usage: wgpu::BufferUsages::STORAGE
						| wgpu::BufferUsages::COPY_DST
						| wgpu::BufferUsages::COPY_SRC,
				mapped_at_creation:false,
				size:4
			}),
			allobjects_buffer: state.device.create_buffer(&wgpu::BufferDescriptor {
				label: Some("allobjects_buffer"),
				usage: wgpu::BufferUsages::STORAGE
						| wgpu::BufferUsages::COPY_DST
						| wgpu::BufferUsages::COPY_SRC,
				mapped_at_creation:false,
				size:64
			}),
			moveit_computeshader: state.create_compute_shader(&(include_str!("moveit.wgsl").to_owned()+include_str!("allobjects.wgsl")), "main"),
			rebuild_computeshader: state.create_compute_shader(include_str!("allobjects.wgsl"), "rebuild"),
		}
	}
	pub fn tick<'a>(&self, state: &'a State<'a>){
		state.run_compute_shader(&self.moveit_computeshader, [&self.volume_buffer, &self.allobjects_buffer], self.allobjects_buffer.size() as u32, 1,1);
		//state.run_compute_shader(&self.rebuild_computeshader, [&self.allobjects_buffer], 1,1,1);//todo
	}
}