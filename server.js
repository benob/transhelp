HOST = null; // localhost
PORT = 8001;

var fu = require("./fu"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring"),
    fs = require("fs"),
    path = require("path"),
    exec = require("child_process").exec,
    formidable = require('./lib/formidable'); // form and file upload handling

console.log = function(text) {
    sys.puts(Date() + " " + text);
}

// while we don't have proper serialization:
dbFile = "data/db.json";
console.log("reading db from " + dbFile + "...");
data = fs.readFileSync(dbFile);
data = String(data).replace(/\n/g, ' ').replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
var content = JSON.parse(data);
var dialogs = {};
var segments = {};
var modified = false;

for(var i = 0; i < content.length; i++) {
    content[i].segments.forEach(function(segment) {
        segments[segment.name] = segment;
    });
    dialogs[content[i].name] = content[i];
    if(content[i].uploaded == undefined) {
        content[i].uploaded = String(Date());
    }
    content[i].index = i; // setup index system
}
console.log("done");

function saveDB() {
    if(modified) {
        console.log("saving db to " + dbFile + "...");
        fs.writeFileSync(dbFile, JSON.stringify(content));
        console.log("done");
        modified = false;
    }
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
        dialogs[result.dialog].transcript_status = "modified " + String(Date());
        modified = true;
        res.simpleJSON(200, result.segment.name);
    }
}));

fu.get("/list_files", function(req, res) {
    var list = content.map(function(item) { 
        // return copy of all dialogs without segments, spectrograms and audio
        var dialog = JSON.parse(JSON.stringify(item));
        dialog.num_segments = dialog.segments.length;
        delete dialog.segments;
        delete dialog.spectrograms;
        delete dialog.audio;
        return dialog;
    });
    res.simpleJSON(200, list);
});

fu.get("/upload", function(req, res) {
    res.send_output = function(overwrite, message) {
        body = '<script language="javascript" type="text/javascript">';
        body += 'window.top.window.stopUpload("' + message + '", ' + (overwrite ? 'true' : 'false') + ');';
        body += '</script>';
        res.writeHead(200, {'Content-Type': 'text/html', 'Content-Length': body.length});
        res.end(body);
    }
    var form = new formidable.IncomingForm();
    form.parse(req, function(error, fields, files) {
        console.log(JSON.stringify(fields));
        var marker = "uploadedfile";
        if(files[marker] != undefined) {
            var source = files[marker].path;
            var destination = "uploads/" + files[marker].filename;
            var name = path.basename(files[marker].filename, path.extname(files[marker].filename));
            console.log("upload: " + source + " -> " + destination);
            path.exists(destination, function(exists) {
                if((dialogs[name] == undefined && !exists) || fields["overwrite"]) {
                    // note that rename(2) does not work across filesystems
                    exec("mv " + source + " " + destination, function(error, stdout, stderr) {
                        if(!error) {
                            // TODO: queue ASR from here
                            var dialog = {
                                group: fields["group"],
                                name: name,
                                original_audio: destination,
                                asr_status: "waiting",
                                transcript_status: "unmodified",
                                uploaded: String(Date()),
                                audio:[],
                                spectrograms:[],
                                segments:[],
                                shown:false,
                            };
                            if(dialogs[name] != undefined) {
                                dialog.index = dialogs[name].index;
                                content[dialog.index] = dialog;
                            } else {
                                dialog.index = content.length;
                                content.push(dialog);
                            }
                            dialogs[name] = dialog;
                            modified = true;
                            res.send_output(false, "Upload successful");
                        } else {
                            res.send_output(false, "Upload failed: " + error);
                        }
                    });
                } else {
                    res.send_output(true, "Upload failed: file already exists");
                }
            });
        } else {
            res.send_output(false, "Upload failed: uploadedfile variable not found");
        }
    });
});

fu.get("/delete_dialog", fu.getPostData(function(req, res) {
    console.log(req.post_data);
    var list = JSON.parse(req.post_data);
    var failed = false;
    var failedElements = [];
    list.map(function(element) {
        if(dialogs[element] == undefined) {
            failed = true;
            failedElements.push(element);
        }
    });
    if(failed) {
        res.simpleJSON(200, {error:"failure", message:"could not find elements", elements: failedElements});
    } else {
        // generate reverse sorted list of indexes
        var indexes = list.map(function(element) { return dialogs[element].index; });
        indexes.sort(function(a, b){ return b - a; });
        indexes.map(function(index) {
            content.splice(index, 1);
        });
        // restore correct indexes
        for(var i = 0; i < content.length; i++) {
            content[i].index = i;
        }
        res.simpleJSON(200, {error:"success", message:"Deleted " + list.length + " dialogs.", elements:list, indexes:indexes});
    }
}));
