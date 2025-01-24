const express = require('express');
const app = express()
var fs = require('fs');

/*app.use(async (req,res,next) => {
	if(req.url.endsWith(".wgsl.js")){
		try{
			res.header("Content-Type", "application/javascript")
			res.end("export default `" + await fs.promises.readFile(__dirname+"/src/"+req.url.replace(".js","")) + "`")
		}catch{next()}
	}else next()
})*/

app.use(express.static(__dirname+'/src'))
app.listen(80)