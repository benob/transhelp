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
var processingList = JSON.parse(String(fs.readFileSync(dbFile + ".processingList")).replace(/\n/g, ''));
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

function saveDB(force) {
    if(modified || force) {
        modified = false;
        if(force) {
            fs.writeFileSync(dbFile, JSON.stringify(content));
            console.log("saved db to " + dbFile);
            fs.writeFileSync(dbFile + ".processingList", JSON.stringify(processingList));
            console.log("saved db to " + dbFile + ".processingList");
        } else {
            fs.writeFile(dbFile, JSON.stringify(content), function(error) {
                if(error) {
                    console.log("ERROR while saving db to " + dbFile + ": " + error);
                } else {
                    console.log("saved db to " + dbFile);
                }
            });
            fs.writeFile(dbFile + ".processingList", JSON.stringify(processingList), function(error) {
                if(error) {
                    console.log("ERROR while saving db to " + dbFile + ".processingList" + ": " + error);
                } else {
                    console.log("saved db to " + dbFile + ".processingList");
                }
            });
        }
    }
}

process.addListener('SIGINT', function() {saveDB(true); process.exit();} );
process.addListener('SIGTERM', function() {saveDB(true); process.exit();} );
setInterval(saveDB, 60000);

// process next item in queue
function processQueue() {
    console.log("processQueue");
    if(processingList.length > 0) {
        var name = processingList.shift();
        modified = true;
        var dialog = dialogs[name];
        if(dialog != undefined) { // && dialog.asr_status.match(/^waiting/)) {
            dialog.asr_status = "running " + String(Date());
            sendMessage("update_dialog", dialog);
            console.log("QUEUE: processing " + dialog.original_audio);
            exec("utils/process_dialog.sh " + dialog.original_audio, function(error, stdout, stderr) {
                if(error) {
                    dialog.asr_status = "failed " + String(Date());
                    sendMessage("update_dialog", dialog);
                    console.log("QUEUE: failed " + dialog.original_audio + " error=" + error);
                    processQueue();
                } else {
                    console.log("QUEUE: success " + dialog.original_audio);
                    fs.readFile(dialog.original_audio + ".json", function(error, data) {
                        data = String(data).replace(/\n/g, ' ').replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
                        var processed = JSON.parse(data)[0];
                        console.log(sys.inspect(processed));
                        dialog.asr_status = "processed " + String(Date());
                        dialog.segments = processed.segments;
                        // update segment index
                        dialog.segments.map(function(segment) {
                            segments[segment.name] = segment;
                        });
                        dialog.spectrograms = processed.spectrograms;
                        dialog.audio = processed.audio;
                        dialog.transcript_status = "unmodified";
                        console.log(JSON.stringify(dialog));
                        sendMessage("update_dialog", dialog);
                        processQueue();
                    });
                }
                console.log(stdout);
                console.log(stderr);
            });
        } else {
            console.log("QUEUE: item '" + name + "' not found");
            processQueue();
        }
    } else {
        //console.log("QUEUE: nothing to do");
        setTimeout(processQueue, 5000);
    }
}

// init queue loop
processQueue();

//fu.basicAuth = "user:password";
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
                            processingList.push(name);
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

fu.get("/reprocess_dialog", fu.getPostData(function(req, res) {
    var list = JSON.parse(req.post_data);
    processingList = processingList.concat(list);
    console.log("LIST: " + JSON.stringify(processingList));
    modified = true;
    list.map(function(element) { dialogs[element].asr_status = "waiting"; });
    res.simpleJSON(200, {error:"success", message:"Queued for reprocessing", elements:list});
    list.forEach(function(element) { sendMessage("update_dialog", dialogs[element]); });
}));

fu.get("/refresh", fu.getPostData(function(req, res) {
    var list = JSON.parse(req.post_data);
    console.log("refresh " + JSON.stringify(list));
    setTimeout(function() {
        list.forEach(function(element) {
            sendMessage("refresh", dialogs[element]);
        });
    }, 3000);
    res.end();
}));

// long polling handler
var requests = []
fu.get("/poll", function(req, res) {
   requests.push({
       response: res,
       timestamp: new Date().getTime()
   });
});

setInterval(function() {
    // close out requests older than 30 seconds
    var expiration = new Date().getTime() - 30000;
    var response;
    requests = requests.filter(function(request) {
        if (request.timestamp < expiration) {
            response = request.response;
            response.simpleJSON(200, {error: "timeout"});
            console.log("timeout");
            return false;
        }
        return true;
    });
}, 1000);

function sendMessage(type, payload) {
    if(requests && requests.length > 0) {
        for(var i = 0; i < requests.length; i++) {
            requests[i].response.simpleJSON(200, {message:type, payload:payload});
        }
        requests = [];
    } else {
    //    // queue for later use?
        setTimeout(function() { sendMessage(type, payload); }, 1000);
        console.log("missed message");
    }
}
