export class Volume{
	chunks = {}
	setAttribute(x,y,z,name,val){
		let chunk = this.getChunk(x,y,z)
		if(!chunk){
			chunk = this.chunks[`${x>>16},${y>>16},${z>>16}`] = new Chunk()
		}
		if(!chunk.attributes[name]) chunk.attributes[name] = new Array(16*16*16)
		chunk.attributes[name][(x&15)<<8|(y&15)<<4|(z&15)] = val
	}
	getAttribute(x,y,z,name){
		let chunk = this.getChunk(x,y,z)
		return chunk?.attributes?.[name][(x&15)<<8|(y&15)<<4|(z&15)]
	}
}
class Chunk{
	attributes = {}
}