struct BVHNode {
	left: u32,
	right: u32
};

struct BVH {
	nodes: array<BVHNode>;
};

@group(0) @binding(0)
var<storage, read_write> bvh: BVH;

fn add_to_bvh() {
	// Example implementation to add a node to the BVH
	let newNode: BVHNode = BVHNode(/* initialize with appropriate values */);
	let index: u32 = /* find appropriate index */;
	bvh.nodes[index] = newNode;
}

fn move_in_bvh() {
	// Example implementation to move a node in the BVH
	let index: u32 = /* find the node index to move */;
	let node: BVHNode = bvh.nodes[index];
	// Update node position or other properties
	bvh.nodes[index] = node;
}

@compute @workgroup_size(1)
fn rebuild(){
	
}