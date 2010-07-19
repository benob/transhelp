function LongPoll(url) {
    this.url = url;
    this.listeners = {};
    this.poll = function() {
        var poller = this;
        $.getJSON(this.url, function(event, textStatus, request) {
            //console.log(request.status, event);
            if(request.status == 200) {
                if(event.message && poller.listeners[event.message] != undefined) {
                   poller.listeners[event.message].forEach(function(callback) {
                       callback(event);
                   });
                }
                poller.poll();
            } else {
                setTimeout(function(){poller.poll();}, 1000);
            }
        });
    };
    this.on = function(message, callback) {
        if(this.listeners[message] == undefined) this.listeners[message] = [];
        this.listeners[message].push(callback);
    };
    this.clear = function (message) {
        if(message) delete this.listeners[message];
        else this.listeners = {};
    }
    this.poll();
}
