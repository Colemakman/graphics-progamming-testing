const GRID_SIZE = 64; // You can change this as you please and the grid will scale.
const UPDATE_INTERVAL = 400; // ms
let step = 0; // Track how many simulation steps have been run
const WORKGROUP_SIZE = 8;

const canvas = document.querySelector("canvas");

async function initWebGPU() {
	if (!navigator.gpu) {
		throw new Error("WebGPU not supported on this browser.");
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error("No appropriate GPUAdapter found.");
	}

	const device = await adapter.requestDevice();

	const context = canvas.getContext("webgpu");
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: device,
		format: canvasFormat,
	});

	const vertices = new Float32Array([
		//   X     Y
		-0.8, -0.8, // Triangle 1 (Blue)
		 0.8, -0.8,
		 0.8,  0.8,

		-0.8, -0.8, // Triangle 2 (Red)
		-0.8,  0.8,
		 0.8,  0.8,
	]);

	const vertexBuffer = device.createBuffer({
		label: "Cell vertices",
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});

	device.queue.writeBuffer(vertexBuffer, 0, vertices);

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [{
			format: "float32x2",
			offset: 0,
			shaderLocation: 0, // Position, see vertex shader
		}],
	};

	const cellShaderModule = device.createShaderModule({
		label: "Cell shader",
		code: await fetch("shaders/cell.wgsl").then(response => response.text()),
	});

	const simulationShaderModule = device.createShaderModule({
		label: "Game of Life simulation shader",
		code: await fetch("shaders/simulation.wgsl").then(response => response.text()),
	});

	const bindGroupLayout = device.createBindGroupLayout({
		label: "Cell Bind Group Layout",
		entries: [{
			binding: 0,
			visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
			buffer: {}
		}, {
			binding: 1,
			visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
			buffer: { type: "read-only-storage" }
		}, {
			binding: 2,
			visibility: GPUShaderStage.COMPUTE,
			buffer: { type: "storage" }
		}]
	});

	const pipelineLayout = device.createPipelineLayout({
		label: "Cell Pipeline Layout",
		bindGroupLayouts: [ bindGroupLayout ],
	});

	const cellPipeline = device.createRenderPipeline({
		label: "cell pipeline",
		layout: pipelineLayout,
		vertex: {
			module: cellShaderModule,
			entryPoint: "vertexMain",
			buffers: [vertexBufferLayout]
		},
		fragment: {
			module: cellShaderModule,
			entryPoint: "fragmentMain",
			targets: [{
				format: canvasFormat
			}]
		}
	});

	const simulationPipeline = device.createComputePipeline({
		label: "Simulation pipeline",
		layout: pipelineLayout,
		compute: {
			module: simulationShaderModule,
			entryPoint: "computeMain",
		}
	});

	// Create a uniform buffer that describes the grid.
	const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
	const uniformBuffer = device.createBuffer({
		label: "Grid Uniforms",
		size: uniformArray.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

	// Create an array representing the active state of each cell
	const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

	// Create a storage buffer ot hold the cell state
	const cellStateStorage = [
		device.createBuffer({
			label: "Cell State A",
			size: cellStateArray.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		}),
		device.createBuffer({
			label: "Cell State B",
			size: cellStateArray.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})
	];

	for (let i = 0; i < cellStateArray.length; i++) {
		cellStateArray[i] = Math.random() > 0.8 ? 1: 0;
	}
	device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

	const bindGroups = [
		device.createBindGroup({
			label: "Cell renderer bind group A",
			layout: bindGroupLayout,
			entries: [{
				binding: 0,
				resource: { buffer: uniformBuffer }
			},
			{
				binding: 1,
				resource: { buffer: cellStateStorage[0] }
			},
			{
				binding: 2,
				resource: { buffer: cellStateStorage[1] }
			}],
		}),
		device.createBindGroup({
			label: "Cell renderer bind group B",
			layout: bindGroupLayout,
			entries: [{
				binding: 0,
				resource: { buffer: uniformBuffer }
			},
			{
				binding: 1,
				resource: { buffer: cellStateStorage[1] }
			},
			{
				binding: 2,
				resource: { buffer: cellStateStorage[0] }
			}],
		})
	];

	function updateGrid() {
		const encoder = device.createCommandEncoder();

		const computePass = encoder.beginComputePass();

		computePass.setPipeline(simulationPipeline);
		computePass.setBindGroup(0, bindGroups[step % 2]);

		const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
		computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

		computePass.end();

		step++;

		const pass = encoder.beginRenderPass({
			colorAttachments: [{
				view: context.getCurrentTexture().createView(),
				loadOp: "clear",
				clearValue: { r: 0, g: 0, b: 0.4, a: 1},
				storeOp: "store",
			}]
		});

		pass.setPipeline(cellPipeline);
		pass.setVertexBuffer(0, vertexBuffer);
		pass.setBindGroup(0, bindGroups[step % 2]);
		pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

		pass.end();
		device.queue.submit([encoder.finish()]);
	}

	setInterval(updateGrid, UPDATE_INTERVAL);
}

initWebGPU();
