use winit::{
	event::*,
	event_loop::EventLoop,
	keyboard::{KeyCode, PhysicalKey},
	window::WindowBuilder,
};

pub async fn run() {
	env_logger::init();
	let event_loop = EventLoop::new().unwrap();
	let window = WindowBuilder::new().build(&event_loop).unwrap();

	let mut state = State::new(&window).await;
	let mut surface_configured = false;

	let _ = event_loop.run(move |event, control_flow| {
			match event {
					Event::WindowEvent {
							ref event,
							window_id,
					} if window_id == state.window().id() => match event {
							WindowEvent::CloseRequested
							| WindowEvent::KeyboardInput {
									event:
											KeyEvent {
													state: ElementState::Pressed,
													physical_key: PhysicalKey::Code(KeyCode::Escape),
													..
											},
									..
							} => control_flow.exit(),

							WindowEvent::Resized(physical_size) => {
								log::info!("physical_size: {physical_size:?}");
								surface_configured = true;
								state.resize(*physical_size);
							}

							WindowEvent::RedrawRequested => {
								// This tells winit that we want another frame after this one
								state.window().request_redraw();

								if !surface_configured {
										return;
								}

								state.update();
								match state.render() {
										Ok(_) => {}
										// Reconfigure the surface if it's lost or outdated
										Err(
												wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated,
										) => state.resize(state.size),
										// The system is out of memory, we should probably quit
										Err(wgpu::SurfaceError::OutOfMemory) => {
												log::error!("OutOfMemory");
												control_flow.exit();
										}

										// This happens when the a frame takes too long to present
										Err(wgpu::SurfaceError::Timeout) => {
												log::warn!("Surface timeout")
										}
								}
							}

							_ => {}
					},
					_ => {}
			}
	});
}

// wasm not all supported yet
// https://sotrh.github.io/learn-wgpu/beginner/tutorial1-window/#wasm-pack


use winit::window::Window;

struct State<'a> {
    surface: wgpu::Surface<'a>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    // The window must be declared after the surface so
    // it gets dropped after it as the surface contains
    // unsafe references to the window's resources.
    window: &'a Window,
}

use wgpu::PresentMode;

impl<'a> State<'a> {
    pub fn window(&self) -> &Window {
        &self.window
    }

    pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
			if new_size.width > 0 && new_size.height > 0 {
					self.size = new_size;
					self.config.width = new_size.width;
					self.config.height = new_size.height;
					self.surface.configure(&self.device, &self.config);
			}
		}

		#[allow(unused_variables)]
		fn input(&mut self, event: &WindowEvent) -> bool {
				false
		}

		fn update(&mut self) {}

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
			let output = self.surface.get_current_texture()?;
			let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
			let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Render Encoder"),
    	});
			
			{
        let _render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Render Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.1,
                        g: 0.2,
                        b: 0.3,
                        a: 1.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
        });
			}

			// submit will accept anything that implements IntoIter
			self.queue.submit(std::iter::once(encoder.finish()));
			output.present();

			Ok(())
    }
}
impl<'a> State<'a> {
	// ...
	async fn new(window: &'a Window) -> State<'a> {
			let size = window.inner_size();

			// The instance is a handle to our GPU
			// Backends::all => Vulkan + Metal + DX12 + Browser WebGPU
			let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
					#[cfg(not(target_arch="wasm32"))]
					backends: wgpu::Backends::PRIMARY,
					#[cfg(target_arch="wasm32")]
					backends: wgpu::Backends::GL,
					..Default::default()
			});
			
			let surface = instance.create_surface(window).unwrap();

			let adapter = instance.request_adapter(
					&wgpu::RequestAdapterOptions {
							power_preference: wgpu::PowerPreference::default(),
							compatible_surface: Some(&surface),
							force_fallback_adapter: false,
					},
			).await.unwrap();

			let (device, queue) = adapter.request_device(
				&wgpu::DeviceDescriptor {
						required_features: wgpu::Features::empty(),
						// WebGL doesn't support all of wgpu's features, so if
						// we're building for the web, we'll have to disable some.
						required_limits: if cfg!(target_arch = "wasm32") {
								wgpu::Limits::downlevel_webgl2_defaults()
						} else {
								wgpu::Limits::default()
						},
						label: None,
						memory_hints: Default::default(),
				},
				None, // Trace path
		).await.unwrap();

		let surface_caps = surface.get_capabilities(&adapter);
		// Shader code in this tutorial assumes an sRGB surface texture. Using a different
		// one will result in all the colors coming out darker. If you want to support non
		// sRGB surfaces, you'll need to account for that when drawing to the frame.
		let surface_format = surface_caps.formats.iter()
				.find(|f| f.is_srgb())
				.copied()
				.unwrap_or(surface_caps.formats[0]);
		let config = wgpu::SurfaceConfiguration {
				usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
				format: surface_format,
				width: size.width,
				height: size.height,
				present_mode: PresentMode::Fifo, //surface_caps.present_modes[0],
				alpha_mode: surface_caps.alpha_modes[0],
				view_formats: vec![],
				desired_maximum_frame_latency: 2,
		};

		Self {
			window,
			surface,
			device,
			queue,
			config,
			size,
		}
	}
}