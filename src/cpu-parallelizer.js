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
		let t = acorn.parse(oldStr, {ecmaVersion: 2025, allowReturnOutsideFunction:true})
		let vartypes = {}, classes = {}
		let replace = []
		acorn.walk.ancestor(t, {
			CallExpression:function(node, state, ancestors){
				// like: typeof thing === Number
				if(node.callee.name === "type"){
					let type = node.arguments[1].name
					let varname = node.arguments[0].name
					if(!classes[type]) throw new Error("missing class for "+type)
					vartypes[varname] = {block:ancestors.findLast(n => n.type === "BlockStatement"), class:classes[type]}
				}
			},
			MemberExpression:function(node, state, ancestors){
				if(vartypes[node.object.name] && ancestors.includes(vartypes[node.object.name].block)){
					let prop = vartypes[node.object.name].class.properties[node.property.name]
					if(!prop) throw new Error("missing property "+node.property.name)
					replace.push([node.start,node.end, "themem["+node.object.name+"+"+prop.offset+"]"])
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
		replace.sort((a,b) => (a[0]-b[0])||(a[3]-b[3])||0)
		let str="",previ=0
		for(let i of replace){
			str+=oldStr.slice(previ,i[0])
			str+=i[2]
			previ=i[1]
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