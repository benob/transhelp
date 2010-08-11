if(this.console == undefined) {
    console = { log: function() {} };
}
function startUpload(){
    $('#f1_upload_process').show();
    $("#wait").show();
    $("#result").html("").hide();
    return true;
}

function stopUpload(message, show_overwrite){
    $("#result").html(message).show();;
    $('#f1_upload_process').hide();
    $('#overwrite input[name=overwrite]').attr('checked', false);
    if(show_overwrite) {
        $('#overwrite').show();
    } else $('#overwrite').hide();
    $("#wait").hide();
    list_files();
    return true;
}

var file_info = null;

function list_files() {
    $.getJSON('/list_files', {}, function(data) {
        file_info = data;
        var list = $('#file_list > tbody');
        $(list).empty();
        var fields = ['action-select', 'action-edit', 'group', 'name', 'original_audio', 'asr_status', 'transcript_status', 'uploaded', 'num_segments'];
        for(var i = 0; i < data.length; i++) {
            var table_row = "<tr>";
            for(var j = 0; j < fields.length ;j++) {
                table_row += '<td class="' + fields[j] + '">' + data[i][fields[j]] + '</td>';
            }
            table_row += "</tr>";
            var row = $(table_row);
            $(row).attr("file_num", i);
            $(list).append(row);
            var row = $(list).children().last();
            $(row).find('td.action-select').html('<input class="select" type="checkbox" />');
            $(row).find('td.action-edit').html('<a class="edit-transcript" href="#" title="Edit transcript"><img border="0" src="images/icon-edit.png" /></a>');
        }
        /*$('#file_list td.original_audio').each(function () {
            $(this).html('<a href="' + $(this).html() + '">' + $(this).html() + '</a>');
        });*/
        /*$('#file_list').find('.asr_status').each(function() {
            var text = $(this).html();
            if(text.match(/^waiting/)) { $(this).css("color", "orange"); }
            else if (text.match(/^processed/)) { $(this).css("color", "green"); }
            else if (text.match(/^failed/)) { $(this).css("color", "red"); }
        });
        $('#file_list').find('.transcript_status').each(function() {
            var text = $(this).html();
            if(text.match(/^modified/)) { $(this).css("color", "orange"); }
            else if (text.match(/^validated/)) { $(this).css("color", "green"); }
        });*/
        $('.edit-transcript').click(function(event) {
            $('#editor-tab').click();
            var name = $(event.target).parents("tr").find(".name").html();
            $('#showname').val(name).change();
        });
        $('#file_list').tablesorter({headers:{0:{sorter:false}, 1:{sorter:false}, 7:{sorter:'usLongDate'}}}); 
        $('#file_list').trigger('update');
        $('#file_list').trigger('sorton', [[[3,0]]]);
    });
};

function select(type) {
    if(type == "all") {
        $("input.select").attr("checked", true);
    } else if(type == "none") {
        $("input.select").attr("checked", false);
    } else if(type == "reverse") {
        $("input.select").each(function() {
            $(this).attr("checked", !$(this).attr("checked"));
        });
    }
}

function action(type) {
    if(type == "delete") {
        var selection = $("input.select[checked!=false]").parents("tr").find(".name").get();
        if(selection.length > 0 && confirm("Do you really want to delete " + selection.length + " files?")) {
            $.post("/delete_dialog", JSON.stringify(selection.map(function(item){return $(item).html();})), function(data) {
                if(data.error == "failed") {
                    console.log(data);
                } else {
                    $("input.select[checked!=false]").parents("tr").fadeOut(function() {
                        $(this).remove();
                    });
                }
            });
        }
    } else if(type == "reprocess") {
        var selection = $("input.select[checked!=false]").parents("tr").find(".name").get();
        if(selection.length > 0 && confirm("Do you really want to reprocess " + selection.length + " files?")) {
            $.post("/reprocess_dialog", JSON.stringify(selection.map(function(item){return $(item).html();})), function(data) {
                if(data.error == "failed") {
                    console.log(data);
                } else {
                    //list_files();
                }
            });
        }
    } else if(type == "cancel") {
        var selection = $("input.select[checked!=false]").parents("tr").find(".name").get();
        if(selection.length > 0 && confirm("Do you really want to cancel " + selection.length + " files?")) {
            $.post("/cancel_processing", JSON.stringify(selection.map(function(item){return $(item).html();})), function(data) {
                if(data.error == "failed") {
                    console.log(data);
                } else {
                    //list_files();
                }
            });
        }
    } else if(type == "refresh") {
        var selection = $("input.select[checked!=false]").parents("tr").find(".name").get();
        $.post("/refresh", JSON.stringify(selection.map(function(item){return $(item).html();})));
    }
}

/*var longpoll = new LongPoll("/poll");
$(function() {
    longpoll.on("update_dialog", function(event) {*/
var eventsource = new EventSource("/event");
$(function() {
    // we get those messages in double. don't know why.
    eventsource.addEventListener("update_dialog", function(event) {
        var message = event.data;
        //console.log(message);
        var dialog = JSON.parse(message.replace("\n", ""));
        var row = $('#file_list').find('td.name')
            .filter(function() { return $(this).html() == dialog.name }).parent();
        //console.log(dialog.name);
        var fields = ['select', 'group', 'name', 'original_audio', 'asr_status', 'transcript_status', 'uploaded', 'num_segments'];
        for(var i = 0; i < fields.length; i++) {
            $(row).find('td.' + fields[i]).html(dialog[fields[i]]);
        }
        row.find('td')
            .css({backgroundColor: 'yellow'}).delay(300)
            .animate({backgroundColor: 'white'});
    }, false);
    $(".tab-header").click(function(event) {
        $('.tab').removeClass('selected');
        $($(event.target).attr("target")).addClass('selected');
        $('.tab-header').removeClass('selected');
        $(event.target).addClass('selected');
    });
});

$(function() {
    $('#file_list').addClass('tablesorter');
    //$("#file_list").tablesorter();
    $("#file_list").bind("sortStart",function() { 
        $("#wait").show(); 
    }).bind("sortEnd",function() { 
        $("#wait").hide(); 
    }); 
    //{sortList:[[6,1]], headers:{6:{sorter:'usLongDate'}}});
    $('#overwrite input[name=overwrite]').attr('checked', false);
    list_files();
});

