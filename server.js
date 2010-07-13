HOST = null; // localhost
PORT = 8001;

var fu = require("./fu"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring"),
    fs = require("fs");

// while we don't have proper serialization:
dbFile = "data/db.json";
console.log("reading db from " + dbFile + "...");
data = fs.readFileSync(dbFile);
data = String(data).replace(/\n/g, ' ').replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
content = JSON.parse(data);
dialogs = {};
segments = {};
for(var i = 0; i < content.length; i++) {
    content[i].segments.forEach(function(segment) {
        segments[segment.name] = segment;
    });
    /*var dialog = JSON.parse(JSON.stringify(content[i]));
    dialog.segments.forEach(function(segment) {
        segment.wordlists = null;
    });*/
    dialogs[content[i].name] = content[i];
}
console.log("done");

function saveDB() {
    console.log("saving db to " + dbFile + "...");
    fs.writeFileSync(dbFile, JSON.stringify(content));
    console.log("done");
}

process.addListener('SIGINT', function() {saveDB(); process.exit();} );
process.addListener('SIGTERM', function() {saveDB(); process.exit();} );
setInterval(saveDB, 60000);

//fu.basicAuth = "portmedia:portmedia@lium";
fu.listen(PORT, HOST);

fu.get("/", fu.staticHandler("./root/index.html"));

fu.documentRoot = "./root";

fu.get("/dialogs", function (req, res) {
    var list = content.map(function(item) { return item.name; } );
    res.simpleJSON(200, list);
});

/* dialog?name=<name> */
fu.get("/dialog", function (req, res) {
    var name = qs.parse(url.parse(req.url).query).name;
    if(dialogs[name] == null) {
        res.simpleJSON(200, {error:"not found",name:name});
    } else {
        var dialog = JSON.parse(JSON.stringify(dialogs[name]));
        // filter out wordlists to make it lighter
        dialog.segments.forEach(function(segment) {
            segment.wordlists = null;
        });
        res.simpleJSON(200, dialog);
    }
});

/* segment?name=<name> */
fu.get("/segment", function (req, res) {
    var name = qs.parse(url.parse(req.url).query).name;
    if(segments[name] == null) {
        res.simpleJSON(200, {error:"not found",name:name});
    } else {
        res.simpleJSON(200, segments[name]);
    }
});

/* save_segment {
 *      "segment": the new segment,
 *      "dialog": the parent of the segment,
 *      "index": index of the segment in it's parent segment list
 * }
 */
fu.get("/save_segment", fu.getPostData(function(req, res) {
    console.log(req.post_data);
    result = JSON.parse(req.post_data); // segment is in POST
    console.log(result);
    if(result == null || !result.segment || !result.index || !result.dialog) {
        res.simpleJSON(200, "not found");
    } else {
        segments[result.segment.name] = result.segment;
        dialogs[result.dialog].segments.splice(result.index, 1, result.segment);
        res.simpleJSON(200, result.segment.name);
    }
}));

/* action {
 *      name:select|insert|remove,
 *      segment:segment-name,
 *      date:"a/b/c 0:0:0",
 *      serial:number,
 *      semantic:no,
 * }
 */
fu.get("/action", function(req, res) {
    var action = JSON.parse(qs.parse(url.parse(req.url).query).action);
});

fu.get("/upload", fu.uploadFileHandler);
