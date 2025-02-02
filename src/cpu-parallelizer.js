import "https://cdn.jsdelivr.net/npm/acorn@8.14.0/dist/acorn.min.js"
import "https://cdn.jsdelivr.net/npm/acorn-walk@8.3.4/dist/walk.min.js"

const workerURL = URL.createObjectURL(new Blob([`
let funcs = new Map()
onmessage = function(e){
	const pkt = e.data
	switch(pkt.type){
		case "create":
			funcs.set(pkt.name, new Function(pkt.func)())
			break
		case "run":
			for(let x=pkt.minX; x<pkt.maxX; x++) for(let y=pkt.minY; y<pkt.maxY; y++) for(let z=pkt.minZ; z<pkt.maxZ; z++){
				funcs.get(pkt.name)(x,y,z, ...pkt.args)
			}
			break
	}
}
`], { type: "text/javascript" }))

export class CPU_Parallelizer{
	constructor(){
		this.w = []
		let wcount = (navigator.hardwareConcurrency||1)-1||1
		for(let i=0;i<wcount;i++){
			this.w.push(new Worker(workerURL))
		}
		this.curId = 0
	}
	create(include, func){
		let oldStr = include.map(i => i.toString()) + "; return "+func.toString()
		let ast = acorn.parse(oldStr, {ecmaVersion: 2025, allowReturnOutsideFunction:true})
		getDefinitions(ast)
		let replace = []
		acorn.walk.full(ast, function(node, state, type){
			if(node.getFromBuffer){
				replace.push([node, node.getFromBuffer[0]+"["+node.getFromBuffer[1]+"+"+node.getFromBuffer[2]+"]"])
			}
			if(node.remove){
				replace.push([node, ""])
			}
		})
		replace.sort((a,b) => (a[0].start-b[0].start)||0)
		let str="",previ=0
		for(let i of replace){
			str+=oldStr.slice(previ,i[0].start)
			str+=i[1]
			previ=i[0].end
		}
		str+=oldStr.slice(previ)
		console.log(str)

		let name = this.curId++
		for(let w of this.w) w.postMessage({type:"create", name})
		return function(sx,sy,sz,...args){
			let step = this.w.length/sx
			let x = 0
			for(let w of this.w){
				w.postMessage({type:"run", name, args, minX:x, minY:0,minZ:0, maxX:x+step, maxY:sy,maxZ:sz})
				x += step
			}
		}
	}
}

export function getDefinitions(ast){
	let vartypes = {}, classes = {}
	acorn.walk.ancestor(ast, {
		CallExpression:function(node, state, ancestors){
			// like: typeof thing === Number
			if(node.callee.name === "type"){
				let varname = node.arguments[0].name
				let type = node.arguments[1].name
				let inWhichBuffer = node.arguments[2].name
				if(!classes[type]) throw new Error("missing class for "+type)
				vartypes[varname] = {block:ancestors.findLast(n => n.type === "BlockStatement"), class:classes[type], inWhichBuffer}
				node.remove = true
			}
		},
		MemberExpression:function(node, state, ancestors){
			if(vartypes[node.object.name] && ancestors.includes(vartypes[node.object.name].block)){
				let type = vartypes[node.object.name]
				let prop = type.class.properties[node.property.name]
				if(!prop) throw new Error("missing property "+node.property.name)
				node.getFromBuffer = [type.inWhichBuffer, node.object.name, prop.offset]
			}
		},
		ClassDeclaration:function(node, state, ancestors){
			let properties = {}, offset = 0
			for(let d of node.body.body){
				if(d.type === "PropertyDefinition"){
					properties[d.key.name] = {offset}
					offset++ //todo: depend on type
				}
			}
			classes[node.id.name] = {block:ancestors.findLast(n => n.type === "BlockStatement"), properties}
		}
	})
}