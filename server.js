HOST = null; // 0.0.0.0
PORT = 8001;
DEBUG = true;

var fu = require("./fu"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring"),
    fs = require("fs"),
    path = require("path"),
    exec = require("child_process").exec,
    formidable = require('./lib/formidable'); // form and file upload handling

process.addListener('uncaughtException', function (err) {
    sys.debug('Caught exception: ' + JSON.stringify(err));
});

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
    if(content[i].asr_status.match(/^running/)) {
        content[i].asr_status = "failed (server killed)";
    }
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

function cleanup() {
    for(name in currentProcess) { 
        processingList.push(name);
        currentProcess[name].kill('SIGKILL');
    }
    saveDB(true);
    process.exit(1);
}
process.addListener('SIGINT', cleanup);
process.addListener('SIGTERM', cleanup);
setInterval(saveDB, 60000);

// process next item in queue
currentProcess = {};
parallelJobs = 0;
maxParallelJobs = 4;
function processQueue() {
    //console.log("processQueue");
    if(processingList.length > 0 && parallelJobs < maxParallelJobs) {
        parallelJobs ++;
        var name = processingList.shift();
        modified = true;
        var dialog = dialogs[name];
        if(dialog != undefined) { // && dialog.asr_status.match(/^waiting/)) {
            dialog.asr_status = "running " + String(Date());
            sendMessage("update_dialog", dialog);
            console.log("QUEUE: processing " + dialog.original_audio);
            currentProcess[dialog.name] = exec("utils/process_dialog.sh " + dialog.original_audio, function(error, stdout, stderr) {
                parallelJobs --;
                delete currentProcess[dialog.name];
                if(error) {
                    if(!dialog.asr_status.match(/^canceling /) && !error.signal == 'SIGKILL') {
                        dialog.asr_status = "failed " + String(Date());
                    } else {
                        dialog.asr_status = "canceled " + String(Date());
                    }
                    sendMessage("update_dialog", dialog);
                    console.log("QUEUE: failed " + dialog.original_audio + " error=" + JSON.stringify(error));
                    //processQueue();
                } else {
                    console.log("QUEUE: success " + dialog.original_audio);
                    fs.readFile("uploads/" + dialog.name + ".json", function(error, data) {
                        if(error) {
                            dialog.asr_status = "failed " + String(Date());
                        } else {
                            data = String(data).replace(/\n/g, ' ').replace(/,\s*\]/g, "]").replace(/,\s*\}/g, "}");
                            try {
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
                            } catch(error) {
                                dialog.asr_status = "failed " + String(Date());
                            }
                        }
                        console.log(JSON.stringify(dialog));
                        sendMessage("update_dialog", dialog);
                        //processQueue();
                    });
                }
                console.log(stdout);
                console.log(stderr);
            });
        } else {
            console.log("QUEUE: item '" + name + "' not found");
            //processQueue();
        }
    } else {
        //console.log("QUEUE: nothing to do");
    }
}

// init queue loop
//processQueue();
setInterval(processQueue, 1000);

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

if(DEBUG) { // warining: do not activate this in production, it's insecure
    fu.get("/eval", fu.getPostData(function(req, res) {
        var code = qs.parse(url.parse(req.url).query).code;
        console.log("CODE:" + code);
        try {
            var result = JSON.stringify(eval(code));
        } catch(error) {
            result = error;
        }
        if(result == undefined) result = "";
        console.log("RESULT:" + result);
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(result);
    }));
}

fu.get("/cancel_processing", fu.getPostData(function(req, res) {
    var list = JSON.parse(req.post_data);
    console.log("cancel " + JSON.stringify(list));
    list.forEach(function(element) {
        if(currentProcess[element] != undefined) {
            console.log("killing " + currentProcess[element].pid);
            currentProcess[element].kill('SIGKILL');
            delete currentProcess[element];
            dialogs[element].asr_status = "canceling " + String(Date());
        } else {
            dialogs[element].asr_status = "canceled " + String(Date());
        }
        processingList = processingList.filter(function(item) { return item != element; });
        sendMessage("update_dialog", dialogs[element]);
    });
    res.end();
}));

fu.get("/log", function(req, res) {
    exec("tail -1000 log/node.log", function(error, stdout, stderr) {
        res.writeHead(200, {"Content-Type": "text/plain"}); //, "Content-Length": stdout.length});
        res.end(stdout);
    });
});

fu.get("/export", function(req, res) {
    var body = JSON.stringify(content);
    res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": body.length,
        "Content-Disposition": 'attachment;filename="transhelp_db.json"'
    });
    res.end(body);
});

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
            //console.log("timeout");
            return false;
        }
        return true;
    });
}, 1000);

/* note: client can be preparing his longpoll and miss a message, therefore we retry up to ttl=5 times. */
function sendMessageLongPoll(type, payload, ttl) {
    ttl = typeof(ttl) != 'undefined' ? ttl : 5;
    if(requests && requests.length > 0) {
        for(var i = 0; i < requests.length; i++) {
            requests[i].response.simpleJSON(200, {message:type, payload:payload});
        }
        requests = [];
    } else if(ttl > 0) {
        setTimeout(function() { sendMessage(type, payload, ttl - 1); }, 1000);
        console.log("missed message: " + type);
    }
}

var message_queue = [];
var message_id = new Date().getTime();
function sendMessage(type, payload, ttl) {
    ttl = typeof(ttl) != 'undefined' ? ttl : 5000; // by default messages leave 5 seconds
    var time = new Date().getTime();
    message_queue.push({type:type, id: message_id, time: time, discard: ttl + time, payload: payload});
    console.log("EVENT: " + message_id);
    message_id ++;
}

setInterval(function() {
    var time = new Date().getTime();
    message_queue = message_queue.filter(function(element) {
        return element.discard > time;
    });
    /*for(id in message_queue) {
        if(message_queue[id].discard < time) {
            delete message_queue[id];
        }
    }*/
}, 1000);

/*setInterval(function() {
    sendMessage("ping", String(Date()));
}, 2000);*/

// eventsource handler (for one client)
fu.get("/event", function(req, res) {
    var last_id = req.headers["last-event-id"];
    //console.log("last-event-id: " + last_id);
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    for(var i = 0; i < message_queue.length; i++) {
        var message = message_queue[i];
        if(last_id == undefined || message.id > last_id) {
            res.write("event:" + message.type + "\n");
            res.write("id:" + message.id + "\n");
            res.write("data:" + JSON.stringify(message.payload) + "\n");
            res.write("\n");
            console.log("EVENT: sent " + message.id);
        }
    }
    res.end();
});
