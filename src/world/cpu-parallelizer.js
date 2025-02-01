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
			//this.w.push(new Worker(workerURL))
		}
	}
	create(include, func){
		let oldStr = include.map(i => i.toString()) + "; return "+func.toString()
		let t = acorn.parse(oldStr, {ecmaVersion: 2025, allowReturnOutsideFunction:true})
		let vartypes = {}, classes = {}
		let replace = []
		acorn.walk.ancestor(t, {
			BinaryExpression:function(node, state, ancestors){
				// like: typeof thing === Number
				if(node.operator === "===" && node.left.operator === "typeof"){
					let type = node.right.name
					let varname = node.left.argument.name
					if(!classes[type]) throw new Error("missing class for "+type)
					vartypes[varname] = {block:ancestors.findLast(n => n.type === "BlockStatement"), class:classes[type]}
				}
			},
			MemberExpression:function(node, state, ancestors){
				if(vartypes[node.object.name] && ancestors.includes(vartypes[node.object.name].block)){
					let offset = vartypes[node.object.name].class.properties[node.property.name].offset
					replace.push([node.start,node.end, "themem["+node.object.name+"+"+offset+"]"])
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

	}
}