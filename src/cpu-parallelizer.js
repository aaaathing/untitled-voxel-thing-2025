import * as parser from "https://cdn.skypack.dev/@babel/parser?min"
import "https://cdn.jsdelivr.net/npm/acorn-walk@8.3.4/dist/walk.min.js"
globalThis.parser = parser


export class CPU_Parallelizer{
	classes = {}
	vartypes = {}
	funcs = new Map()
	storage = new Map()
	constructor(){
		this.w = []
		this.curId = 0
		this.includeCode = []
		this.code = []
	}
	/**
	 * @param {[string, any][]} entries 
	 */
	addStorage(entries){
		for(let e of entries) this.storage.set(e[0], e[1])
	}
	include(source){
		let code = applyReplace(source, transpileToJS(source, this))
		this.code.push(code, "\n")
		this.includeCode.push(code, "\n")
	}
	createParallelFunc(func){
		let source = "("+func.toString()+")"
		let ast = transpileToJS(source, this)
		let name = acorn.walk.findNodeAfter(ast,0, "FunctionExpression").node.id.name
		this.code.push("funcs.set('"+name+"',"+applyReplace(source, ast)+");\n")

		let result = function(sx,sy,sz,...args){
			console.log(sx,sy,sz,args)
			let step = this.w.length/sx
			let x = 0
			for(let w of this.w){
				w.postMessage({name, args, minX:x, minY:0,minZ:0, maxX:x+step, maxY:sy,maxZ:sz})
				x += step
			}
		}
		this.funcs.set(name, result)
		return result
	}
	includeSequentialFunc(func){
		let source = func.toString()
		let ast = transpileToJS(source, this)
		acorn.walk.simple(ast, {
			FunctionDeclaration:function(node){
				ast.replace.push([node.body.body[0].start,node.body.body[0].start, "\nwhile(Atomics.compareExchange(sequentialSync,0, 0,1) !== 0) Atomics.wait(sequentialSync,0, 1);\n"])
				ast.replace.push([node.body.body[node.body.body.length-1].end,node.body.body[node.body.body.length-1].end, "\nAtomics.store(sequentialSync,0,0); Atomics.notify(sequentialSync,0, 1);\n"])
			}
		})
		this.code.push(applyReplace(source, ast))
		this.code.push("\n")
	}
	done(){
		let storageNames = Array.from(this.storage.keys()).join(",")
		this.code.unshift(`
let sequentialSync
let funcs = new Map()
onmessage = function(e){
	const pkt = e.data
	if(pkt.args){
		for(let x=pkt.minX; x<pkt.maxX; x++) for(let y=pkt.minY; y<pkt.maxY; y++) for(let z=pkt.minZ; z<pkt.maxZ; z++){
			funcs.get(pkt.name)(x,y,z, ...pkt.args)
		}
	}else if(pkt.storage){
		[${storageNames}] = pkt.storage
		sequentialSync = pkt.sequentialSync
	}
}
`)
		this.code.push(`postMessage("started")`)
		console.log(this.code)
		const workerURL = URL.createObjectURL(new Blob(this.code, { type: "text/javascript" }))
		let wcount = (navigator.hardwareConcurrency||1)-1||1
		let sequentialSync = new Int32Array(new SharedArrayBuffer(4))
		for(let i=0;i<wcount;i++){
			let w = new Worker(workerURL)
			w.onmessage = e => {
				if(e.data === "started") w.postMessage({storage:Array.from(this.storage.values()), sequentialSync})
			}
			this.w.push(w)
		}
	}
	runFuncs = new Map()
	runFunc(usedStorage, func, ...args){
		if(!this.runFuncs.get(func)){
			let source = "("+func.toString()+")"
			let ast = transpileToJS(source, this)
			acorn.walk.simple(ast, {
				CallExpression: (node) => {
					if(this.funcs.get(node.callee.name)){
						ast.replace.push([node.callee.start,node.callee.end, `parallelizer.funcs.get(${JSON.stringify(node.callee.name)})`])
					}
				}
			})
			let newStr = this.includeCode.join("")+"\n"
			for(let s of usedStorage){
				newStr += s+"=parallelizer.storage.get('"+s+"')\n"
			}
			newStr += "return " + applyReplace(source, ast)
			console.log(newStr)
			this.runFuncs.set(func, new Function("parallelizer", newStr)(this))
		}
		this.runFuncs.get(func)(...args)
	}
	/** first element for length */
	createArray(){
		let view = new DataView(new SharedArrayBuffer(4,{maxByteLength:2**34}))
		view.Uint8Array = new Uint8Array(view.buffer)
		return view
	}
	push(arr, type){
		let length = arr.getUint32(0) + 1
		arr.setUint32(0,length)
		let classSize = this.classes[type].size
		if(length*classSize>arr.buffer.byteLength) arr.buffer.grow(length*classSize)
	}
	pop(arr, index, type){
		let length = arr.getUint32(0) - 1
		arr.setUint32(0,length)
		let classSize = this.classes[type].size
		arr.Uint8Array.set(arr.Uint8Array.subarray(index*classSize + classSize), index*classSize)
	}
}

export function transpileToJS(source, parallelizer){
	let ast = parse(source, parallelizer)
	let replace = []
	acorn.walk.full(ast, function(node, state, type){
		if(node.getFromBuffer){
			let dataType
			switch(node.getFromBuffer.type){
				case "TSNumberKeyword": dataType = "Float32"; break
				case "TSBooleanKeyword": dataType = "Uint8"; break
				case "uint32": dataType = "Uint32"; break
			}
			if(node.getFromBuffer.assign){ // convert a.b=1 to mem.set(a+0,1)
				replace.push([node.getFromBuffer.assign.start,node.getFromBuffer.assign.end, node.getFromBuffer.inWhichBuffer+".set"+dataType+"("+(node.getFromBuffer.name?node.getFromBuffer.name+"+":"")+node.getFromBuffer.offset+","+source.substring(node.getFromBuffer.assign.right.start,node.getFromBuffer.assign.right.end)+")"])
			}else{ // convert a.b to mem.get(a+0)
				replace.push([node.start,node.end, node.getFromBuffer.inWhichBuffer+".get"+dataType+"("+(node.getFromBuffer.name?node.getFromBuffer.name+"+":"")+node.getFromBuffer.offset+")"])
			}
		}else if(node.addMult){
			replace.push([node.start,node.end, "("+source.substring(node.addMult.node.start,node.addMult.node.end)+"*"+node.addMult.mult+"+"+node.addMult.add+")"])
		}
		if(node.remove){
			replace.push([node.start,node.end, ""])
		}
		if(node.typeAnnotation){
			replace.push([node.typeAnnotation.start,node.typeAnnotation.end, ""])
		}
	})
	ast.replace = replace
	return ast
}

export function applyReplace(source, {replace}){
	replace.sort((a,b) => (a[0]-b[0])||0)
	let str="",previ=0
	for(let i of replace){
		str+=source.slice(previ,i[0])
		str+=i[2]
		previ=i[1]
	}
	str+=source.slice(previ)
	return str
}

acorn.walk.base.ClassProperty = acorn.walk.base.PropertyDefinition
/**
 * Finds and set types and classes.
 * convert `anObject<objectsBuffer>` and `anObject.x`
 */
export function parse(source, parallelizer){
	let ast = parser.parse(source, {plugins:["typescript","estree"]}).program
	let {classes, vartypes} = parallelizer
	acorn.walk.ancestor(ast, {
		// Find a.b and a.b=1
		MemberExpression:function(node, state, ancestors){
			let type = vartypes[node.object.name]
			if(type && (!type.inBlock || ancestors.includes(type.inBlock))){
				switch(type.typeAnnotation.typeAnnotation.type){
					case "TSArrayType":{ // first 4 bytes of array is length
						let theClass = classes[type.typeAnnotation.typeAnnotation.elementType.typeName.name]
						if(node.computed){ // array[index]
							node.addMult = {node:node.property, mult:theClass.size, add:4}
						}else if(node.property.name === "length"){ // array.length
							node.getFromBuffer = {
								inWhichBuffer: node.object.name,
								offset:0, size:4, type:"uint32",
							}
						}
						break
					}
					case "TSTypeReference":{
						let prop = classes[type.typeAnnotation.typeAnnotation.typeName.name]?.properties[node.property.name]
						if(!prop) throw new Error("missing property "+node.property.name)
						let pa = ancestors[ancestors.length-2]
						node.getFromBuffer = {
							inWhichBuffer: type.typeAnnotation.typeAnnotation.typeParameters.params[0].typeName.name,
							name:node.object.name, offset:prop.offset, size:prop.size, type:prop.type,
							assign: pa.type === "AssignmentExpression" && pa.left === node ? pa : null
						}
						break
					}
				}
			}
		},
		// Choose offsets for class properties
		ClassDeclaration:function(node, state, ancestors){
			let properties = {}, offset = 0
			for(let d of node.body.body){
				if(d.type === "ClassProperty"){
					let size = sizeOf(d)
					properties[d.key.name] = {offset, size, type:d.typeAnnotation.typeAnnotation.type}
					offset += size
				}
			}
			classes[node.id.name] = {block:ancestors.findLast(n => n.type === "BlockStatement"), properties, size:offset}
		},
		VariableDeclarator:function(node, state, ancestors){
			let varname = node.id.name
			if(node.id.typeAnnotation) vartypes[varname] = node.id, vartypes[varname].inBlock = ancestors.findLast(n => n.type === "BlockStatement")
		}
	}, {
		...acorn.walk.base,
		// Find types and buffers in function parameters
		FunctionDeclaration:function(node, state, c){
			for(let d of node.params){
				let varname = d.name
				if(d.typeAnnotation) vartypes[varname] = d, vartypes[varname].inBlock = node.body
			}
			acorn.walk.base.FunctionDeclaration(node,state,c)
		},
		FunctionExpression:function(node, state, c){ this.FunctionDeclaration(node,state,c) },
	})
	return ast
}
function sizeOf(node){
	switch(node.typeAnnotation.typeAnnotation.type){
		case "TSNumberKeyword": return 4
		case "TSBooleanKeyword": return 1
		default: throw new Error("no type "+node.typeAnnotation.typeAnnotation.type)
	}
}

// -------- allocator ---------

const insideAllocUnempty = 1<<31
export const insideAlloc = {
	alloc: function alloc(arr,size){
		let i = arr[0]||2; //cur
		let v = arr[i+1];
		let resetTimes = 0;
		while(((v&insideAllocUnempty) || ((v&(~insideAllocUnempty))!==size+2 && (v&(~insideAllocUnempty))<=size+2+2 && v != 0))){
			i += v&(~insideAllocUnempty);
			v = arr[i+1];
			if(i+2+size+2>arr.length){
				if(resetTimes){
					//while(i+2+size+2>arr.length) arr = this.arr = lengthenArr(arr)
					arr.buffer.grow(i+2+size+2)
				}else{
					i = 1;
					v = arr[i+1]
					resetTimes++;
				}
			}
		}
		arr[0] = i; //cur
		//if same emptyness length is 0, it is at the end
		//after this, v should not have unemptyChunkData in it
		arr[i+1] = (2+size)|insideAllocUnempty;
		if(size+2 != v){
			let i2 = i+2+size;
			arr[i2] = 2+size;
			if(v != 0){ //not at end
				arr[i2+1] = v-size- 2;
				arr[i+v] = v-size- 2;
			}
		}
		return i+2;
	},
	free:function free(arr, xptr){
		let i = xptr - 2;
		arr[i+1] = arr[i+1]&(~insideAllocUnempty);
		let prevI = i-arr[i];
		let prevNext = arr[prevI+1];
		if(arr[i] && !(prevNext&insideAllocUnempty) && i != 0){//previous is empty, merge
			let newNext = prevNext+arr[i+1];
			if(this.cur == i){this.cur = prevI;}
			i = prevI;
			arr[i+1] = newNext;
			arr[i+newNext] = newNext;
		}
		let nextI = i+arr[i+1];
		let nextNext = arr[nextI+1];
		if(arr[i+1] && !(nextNext&insideAllocUnempty)){//next is empty, merge
			let newNext = arr[i+1]+nextNext;
			if(this.cur == nextI){this.cur = i;}
			arr[i+1] = newNext;
			arr[i+newNext] = newNext;
		}
	}
}