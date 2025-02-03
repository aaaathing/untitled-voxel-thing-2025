import * as parser from "https://cdn.skypack.dev/@babel/parser?min"
import "https://cdn.jsdelivr.net/npm/acorn-walk@8.3.4/dist/walk.min.js"
globalThis.parser = parser


export class CPU_Parallelizer{
	constructor(){
		this.w = []
		this.curId = 0
		this.code = [`
let funcs = new Map()
onmessage = function(e){
	const pkt = e.data
	switch(pkt.type){
		//case "create":
		//	funcs.set(pkt.name, new Function(pkt.func)())
		//	break
		case "run":
			for(let x=pkt.minX; x<pkt.maxX; x++) for(let y=pkt.minY; y<pkt.maxY; y++) for(let z=pkt.minZ; z<pkt.maxZ; z++){
				funcs.get(pkt.name)(x,y,z, ...pkt.args)
			}
			break
	}
}
`]
		this.classes = {}
	}
	include(source){
		let ast = parse(source, this)
		let replace = []
		acorn.walk.full(ast, function(node, state, type){
			if(node.getFromBuffer){
				let dataType
				switch(node.getFromBuffer.type.typeAnnotation.typeAnnotation.type){
					case "TSNumberKeyword": dataType = "Float32"; break
					case "TSBooleanKeyword": dataType = "Uint8"; break
				}
				if(node.getFromBuffer.assign){ // convert a.b=1 to mem.set(a+0,1)
					replace.push([node.getFromBuffer.assign, node.getFromBuffer.inWhichBuffer+".set"+dataType+"("+node.getFromBuffer.name+"+"+node.getFromBuffer.offset+","+source.substring(node.getFromBuffer.assign.right.start,node.getFromBuffer.assign.right.end)+")"])
				}else{ // convert a.b to mem.get(a+0)
					replace.push([node, node.getFromBuffer.inWhichBuffer+".get"+dataType+"("+node.getFromBuffer.name+"+"+node.getFromBuffer.offset+")"])
				}
			}
			if(node.remove){
				replace.push([node, ""])
			}
			if(node.typeAnnotation){
				replace.push([node.typeAnnotation, ""])
			}
		})
		
		replace.sort((a,b) => (a[0].start-b[0].start)||0)
		let str="",previ=0
		for(let i of replace){
			str+=source.slice(previ,i[0].start)
			str+=i[1]
			previ=i[0].end
		}
		str+=source.slice(previ)
		console.log(str)
		this.code.push(str)
	}
	create(func){
		let name = "func"+this.curId++
		this.include("funcs.set('"+name+"',"+func.toString()+");")

		//for(let w of this.w) w.postMessage({type:"create", name})
		return function(sx,sy,sz,...args){
			let step = this.w.length/sx
			let x = 0
			for(let w of this.w){
				w.postMessage({type:"run", name, args, minX:x, minY:0,minZ:0, maxX:x+step, maxY:sy,maxZ:sz})
				x += step
			}
		}
	}
	done(){
		const workerURL = URL.createObjectURL(new Blob(this.code, { type: "text/javascript" }))
		let wcount = (navigator.hardwareConcurrency||1)-1||1
		for(let i=0;i<wcount;i++){
			this.w.push(new Worker(workerURL))
		}
	}
	createBuffer(){
		return new DataView(new SharedArrayBuffer(0,{maxByteLength:2**34}))
	}
}

acorn.walk.base.ClassProperty = acorn.walk.base.PropertyDefinition
export function parse(source, parallelizer){
	let ast = parser.parse(source, {plugins:["typescript","estree"]}).program
	let {classes} = parallelizer
	let vartypes = {}
	acorn.walk.ancestor(ast, {
		MemberExpression:function(node, state, ancestors){
			if(vartypes[node.object.name] && ancestors.includes(vartypes[node.object.name].block)){
				let type = vartypes[node.object.name]
				let prop = type.class.properties[node.property.name]
				if(!prop) throw new Error("missing property "+node.property.name)
				let pa = ancestors[ancestors.length-2]
				node.getFromBuffer = {
					inWhichBuffer:type.inWhichBuffer, name:node.object.name, offset:prop.offset, size:prop.size, type:prop.type,
					assign: pa.type === "AssignmentExpression" && pa.left === node ? pa : null
				}
			}
		},
		ClassDeclaration:function(node, state, ancestors){
			let properties = {}, offset = 0
			for(let d of node.body.body){
				if(d.type === "ClassProperty"){
					let size = sizeOf(d)
					properties[d.key.name] = {offset, size, type:d}
					offset += size
				}
			}
			classes[node.id.name] = {block:ancestors.findLast(n => n.type === "BlockStatement"), properties}
		}
	}, {
		...acorn.walk.base,
		FunctionDeclaration:function(node, state, c){
			for(let d of node.params){
				if(d.typeAnnotation && classes[d.typeAnnotation.typeAnnotation.typeName.name]){
					let varname = d.name
					let type = d.typeAnnotation.typeAnnotation.typeName.name
					let inWhichBuffer = d.typeAnnotation.typeAnnotation.typeParameters.params[0].typeName.name
					vartypes[varname] = {block:node.body, class:classes[type], inWhichBuffer}
				}
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