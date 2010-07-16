var lattice;
var selectionStart = null;
var dragStart = null;
var undoActions = [];
var redoActions = [];
var sentences = [];
var current_sentence;
var current_segment = null;
var current_dialog;
var displayAnnotation = false;

function loadScript(url, callback) {
    $("#lattice_script").remove();
    var script = $('<script id="lattice_script" type="text/javascript"></script>')[0];
    script.onreadystatechange = function () {
        if (this.readyState == 'complete') callback();
    }
    script.onload = callback;
    script.src = url;
    $("head").append(script);
}

function secondsToHms(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);
    var f = Math.floor((d * 10) % 10);
    return ((h > 0 ? h + ":" : "") + (m > 0 ? (h > 0 && m < 10 ? "0" : "") + m + ":" : "0:") + (s < 10 ? "0" : "") + s + "." + f);
}

$(function() {
        $('#play').button({
            text: false,
            icons: {
                primary: 'ui-icon-play'
            }
        })
        .click(function() {
            $("#player")[0].play();
        });
        $('#pause').button({
            text: false,
            icons: {
                primary: 'ui-icon-pause'
            }
        })
        .click(function() {
            $("#player")[0].pause();
        });
        // Slider
        $('#slider').slider({
            range: "min",
            step: .1,
        });
        $("#player")[0].addEventListener('timeupdate', function(evt) {
                var value = this.currentTime;
                $('#slider').slider("value", value);
                $("#time").val(secondsToHms(value));
                if(!this.paused) {
                    $("wordlist").removeClass("selected");
                    $("wordlist").filter(function() {
                        return this.backend.start <= value + 0.01 && this.backend.end >= value;
                    }).addClass("selected");
                }
            }, true);

        $("#player")[0].addEventListener('durationchange', function(evt) {
                if(current_segment) $('#player')[0].currentTime = current_segment.start;
                else $('#player')[0].currentTime = 0;
                $('#slider').slider("option", "max", $("#player")[0].duration);
            }, true);

        $("#slider").slider("option", "slide", function(event, ui) {
                $("#player")[0].currentTime = ui.value;
            });
        $("#save").button();
        $("#revert").button();
        $("#next").button();
        $("#previous").button();
        $("#undo").button({
            text: false,
            disabled: true,
            icons: {
                primary: 'ui-icon-arrowreturnthick-1-w'
            }
        }).click(function() {
            var action;
            while(null != (action = undoActions.pop())) {
                redoActions.push(action);
                action.undo();
                if(action.isSemantic) break;
            }
            $("#redo").button('enable');
            if(undoActions.length == 0) {
                $("#undo").button('disable');
                $("#save_sentence").button('disable');
            }
        });
        $("#redo").button({
            text: false,
            disabled: true,
            icons: {
                primary: 'ui-icon-arrowreturnthick-1-e'
            }
        }).click(function() {
            var action = redoActions.pop();
            if(action) {
                undoActions.push(action);
                action.perform();
            }
            while(redoActions.length > 0 && !redoActions[redoActions.length - 1].isSemantic) {
                action = redoActions.pop();
                undoActions.push(action);
                action.perform();
            }
            $("#undo").button('enable');
            $("#save_sentence").button('enable');
            if(redoActions.length == 0) {
                $("#redo").button('disable');
            }
        });
        $("#show_spectrogram").click(function() {
            $("#spectrogram").toggle();
        });
    });

    function remove(isSemantic, elements, immediate, noselect) { // elements need to be ordered naturally!
        elements = $(elements).filter(":not(.anchor .editing)").filter(function() { return this.parentNode != null; });
        if(elements.get().length == 0) return;
        if(window.console != undefined) console.log("remove ", elements);
        var action = {
            name: "remove",
            isSemantic: isSemantic,
            indexes: $(elements).map(function() { return $(this).index(); }),
            parents: $(elements).map(function() { return this.parentNode; }),
            elements: $(elements),
            immediate: immediate,
            reselect: !noselect,
            selection: $("wordlist.selected"),
            perform: function() {
                var next = $(this.elements).last().next();
                var action = this;
                var time = this.immediate ? 0 : 200;
                $(this.elements).fadeOut(time, function() {
                    if(action.reselect) {
                        $("wordlist").removeClass("selected");
                        $(action.elements).removeClass("selected");
                        $(next).addClass("selected");
                    }
                    $(action.elements).remove();
                    for(var i = 0; i < action.indexes.length; i++) {
                        current_segment.wordlists.splice(action.indexes[i] - 1, 1);
                    }
                    selectionChanged();
                });
            },
            undo: function() {
                $(this.elements).hide();
                for(var i = 0; i < this.elements.length; i++) {
                    if(!this.parents[i]) {
                        if(window.console != undefined) console.log(this);
                    }
                    if(this.indexes[i] < this.parents[i].childNodes.length) {
                        $(this.parents[i].childNodes[this.indexes[i]]).before(this.elements[i]);
                        current_segment.wordlists.splice(this.indexes[i] - 1, 1, this.elements[i].backend);
                    } else {
                        $(this.parents[i]).append(this.elements[i]);
                    }
                }
                $(this.elements).css("display", "inline-block");
                if(this.reselect) {
                    $("wordlist").removeClass("selected");
                    $(this.selection).addClass("selected");
                }
                var time = this.immediate ? 0 : 200;
                var action = this;
                $(this.elements).fadeIn(time, function() { selectionChanged();} );
            }
        };
        undoActions.push(action);
        redoActions = Array();
        action.perform();
        $("#undo").button('enable');
        $("#save_sentence").button('enable');
    }

    function chooseWord(isSemantic, word) {
        var parent = $(word).parent("wordlist");
        var action = {
            name: "chooseWord",
            isSemantic: isSemantic,
            wordList: $(parent).index(),
            wordId: $(word).index(),
            backendId: $(parent).find("word").index(word),
            previous: $(parent).find("word.selected").index(),
            backendPrevious: parent[0].backend.selected,
            perform: function() {
                var wordList = $("lattice").find("wordlist")[this.wordList];
                $(wordList).find("word").removeClass("selected");
                $($(wordList).children()[this.wordId]).addClass("selected");
                wordList.backend.selected = this.backendId;
            },
            undo: function() {
                var wordList = $("lattice").find("wordlist")[this.wordList];
                $(wordList).find("word").removeClass("selected");
                $($(wordList).children()[this.previous]).addClass("selected");
                wordList.backend.selected = this.backendPrevious;
            }
        }
        undoActions.push(action);
        redoActions = Array();
        action.perform();
        $("#undo").button('enable');
        $("#save_sentence").button('enable');
    }

    function insert(isSemantic, element, after, noselect) {
        while($(after).is(".editing")) {
            after = $(after).prev();
        }
        if(window.console != undefined) console.log("insert ", element);
        action = {
            name: "insert",
            isSemantic: isSemantic,
            element: element,
            parentNode: $(after).parent()[0],
            afterIndex: $(after).index(),
            reselect: !noselect,
            perform: function() {
                //console.log("insert perform %o", this);
                //$(this.element).hide();
                //$(this.after).after(element);
                $(this.parentNode.childNodes[this.afterIndex]).after(element);
                $(this.element).css("display", "inline-block");
                if(this.reselect) {
                    $("wordlist").removeClass("selected");
                    $(this.element).addClass("selected");
                }
                current_segment.wordlists.splice(this.afterIndex, 0, this.element[0].backend);
                selectionChanged();
            },
            undo: function() {
                //console.log("insert undo %o", this);
                var action = this;
                if(this.reselect) {
                    $("wordlist").removeClass("selected");
                    $(this.element).prev().addClass("selected");
                }
                $(this.element).remove();
                current_segment.wordlists.splice(this.afterIndex, 1);
                selectionChanged();
            }
        };
        undoActions.push(action);
        redoActions = Array();
        action.perform();
        $("#undo").button('enable');
        $("#save_sentence").button('enable');
    }

    function selectionChanged(target, nocancel) {
        var selected = $("wordlist.selected:visible");
        var icons = $("#icons");
        /*if($("wordlist input").length > 0 && !nocancel) {
            $("icon.cancel").click();
        }*/
        if(selected.length == 0) {
            $(icons).css("visibility", "hidden");
        } else {
            if(!target) target = selected[0];
            if($.inArray(target, selected) == -1) target = selected[0];
            var offset = $(target).offset();
            offset.top -= 16;
            $(icons).css('position','absolute');
            $(icons).offset(offset);
            $(icons).css('visibility','visible');
        }
    }

    function saveSentence(sentence) {
        if(current_segment == null) return;
        // need to add to server
        wordlists = $("lattice").find("wordlist:not(.anchor)").get();
        text = "";
        for(var list = 0; list < wordlists.length; list++) {
            text += " " + $(wordlists[list]).find("word.selected").first().html();
        }
        current_segment.text = text;
        current_segment.last_modified = new String(new Date());
        var placeholder = $(sentence).find("placeholder")[0];
        var index = placeholder.getAttribute("sentence_index");
        var expected_result = current_segment.name;
        $.post("/save_segment", JSON.stringify({segment: current_segment, index: index, dialog:current_dialog.name}), function(result) {
            if(result != expected_result) {
                alert("Unexpected error while saving the sentence");
            }
        });
        $("lattice").parent().find("placeholder").html(current_segment.start + "-" + current_segment.end + "<span class=\"last_modified\"> Last modified: " + current_segment.last_modified + " </span><span class=\"message\"> Saved </span><br>" + text);
        $("#segmentation").remove();
        $("#save_sentence").remove();
        $("lattice").remove();
        $("placeholder").show();
        $("sentence").removeClass("selected");
        $("sentence").addClass("clickable");
        current_segment = null;
        selectionChanged();
        undoActions = [];
        redoActions = [];
        $(".message").delay(1000).fadeOut(1000, function() {
            $(".message").remove();
        });
    }

    function setupLattice(segment) {
        // create elements
        var columns = $("lattice");
        undoActions = [];
        redoActions = [];
        $("#undo").button("disable");
        $("#redo").button("disable");
        $("wordlist").removeClass("selected").remove(); /* bug when switching sentence/file while editing */
        columns.empty();
        for(var i = 0; i < segment.wordlists.length; i++) {
            var wordlist = $('<wordlist></wordlist>');
            for(var j = 0; j < segment.wordlists[i].words.length; j++) {
                var word = $('<word>' + segment.wordlists[i].words[j] + '</word>');
                if(segment.wordlists[i].selected == j) {
                    word.addClass("selected");
                }
                wordlist.append(word);
            }
            columns.append(wordlist);
            wordlist.get(0).backend = segment.wordlists[i];
        }

        // cleanup
        $("wordlist").remove(":empty");
        $("wordlist").filter(function() {
            var child = $(this).children("word")[0];
            return (child.innerHTML == "eps" && child.getAttribute("title") > 0.5);
        }).remove();
        $("word").filter(function() { return this.innerHTML == "eps" }).remove();
        $("word").after("<br />");

        /*// highlight one-best
        $("word").filter(function() {
            return $(this).parent()[0].firstChild == this;
        }).addClass("selected");*/

        // setup icons
        $("icon").unbind("click");
        $("icon.delete").addClass("ui-icon ui-icon-cancel");
        $("icon.edit").addClass("ui-icon ui-icon-comment");
        $("icon.insert").addClass("ui-icon ui-icon-document");
        $("icon.cancel").addClass("ui-icon ui-icon-close").hide();
        $("icon.save").addClass("ui-icon ui-icon-check").hide();

        // setup events
        $("icon.delete").click(function(event) {
            var selected = $("wordlist.selected:not(.anchor)").get();
            remove(true, selected, false, false);
            return false;
        });
        $("icon.insert").click(function(event) {
            var selected = $("wordlist.selected").last().get();
            if(selected.length > 0) {
                var target = selected[0];
                if($(target).hasClass("anchor last")) target = $(target).prev();
                $("wordlist.selected").removeClass("selected");
                $(target).after(true, '<wordlist class="selected insertion"></wordlist>');
                selectionChanged();
                $("icon.edit").click();
            }
            return false;
        });
        $("icon.edit").click(function(event) {
            $("#player")[0].pause();
            $("input").remove(); /* bug when switching sentence/file while editing */
            var selected = $("wordlist.selected:not(.anchor)").get();
            if(selected.length == 0) return;
            var width = 0;
            var text = '';
            for(var i = 0; i < selected.length; i++) {
                width += selected[i].offsetWidth;
                var word = $(selected[i]).find('word.selected');
                if(word.length > 0) {
                    if(text != '') text += ' ';
                    text += word[0].innerHTML;
                }
            }
            if(width < 40) width = 40;
            if(width > $("lattice").width() - 10) width = $("lattice").width() - 10;
            $(selected).last().after('<wordlist class="selected editing"><input class="editing" type="text" style="width:' + 
                width + '" value="' + text + '"></input></wordlist>');
            var input = $("wordlist input").get()[0];
            if($("wordlist.insertion").length > 0) {
                $(input).addClass("insertion");
            }
            input.select();
            input.focus();
            $(input).keydown(function(event) {
                if(event.keyCode == 27) { // escape
                    if($("wordlist.insertion").length > 0) {
                        $("wordlist").removeClass("selected");
                        $(this).parent("wordlist").prev().prev().addClass("selected");
                    }
                    if(!$(this).is(".insertion")) {
                        undoActions.pop().undo();
                    }
                    $(this).parent("wordlist").remove();
                    //$(selected).show();
                    $("wordlist.insertion").remove();
                    $("icon.edition-icon").hide();
                    $("icon.wordlist-icon").show();
                    selectionChanged();
                    event.preventDefault();
                    return false;
                } else if(event.keyCode == 13 || event.keyCode == 9) { // enter or tab
                    var value = $.trim($(this).val());
                    var previous = $(this).parents('wordlist').prev(":visible:not(.editing)");
                    var next = $(this).parents('wordlist').next();
                    if(value != "") {
                        var after = $(this).parents('wordlist');
                        if(after.length == 0) {
                            after = $(this).parents('wordlist');
                        }
                        var elements =  value.split(/\s+/); // create one wordlist per word
                        start_time = previous[0].backend.end;
                        time_step = Math.abs(next[0].backend.start - previous[0].backend.end) / elements.length;
                        for(var i = 0; i < elements.length; i++) {
                            var isSemantic = (i == elements.length - 1 && $(this).is(".insertion")) ? true : false;
                            var element = $('<wordlist class="selected"><word class="selected">' + elements[i] + '</word></wordlist>');
                            element[0].backend = {start:start_time, end:start_time + time_step, selected: 0, words:[elements[i]]};
                            start_time += time_step;
                            insert(isSemantic, element, after, true);
                        }
                        //remove(false, $(selected), true, true);
                    }
                    if(event.keyCode == 9) {
                        if(event.shiftKey) {
                            $("wordlist").removeClass('selected');
                            previous.addClass('selected');
                        } else {
                            $("wordlist").removeClass('selected');
                            next.addClass('selected');
                        }
                    }
                    $(this).parents('wordlist').remove();
                    $("icon.edition-icon").hide();
                    $("icon.wordlist-icon").show();
                    selectionChanged();
                    event.preventDefault();
                    return false;
                } else {
                    // todo: change length to reflect content
                }
            });
            $("wordlist.insertion").remove();
            remove(true, $(selected), true, true);
            $("icon.wordlist-icon").hide();
            $("icon.edition-icon").show();
            selectionChanged(null, true);
            return false;
        });
        $("icon.save").click(function(event) {
            if($("wordlist input").length > 0) {
                event = $.Event("keydown");
                event.keyCode = 13;
                $("wordlist input").trigger(event);
            }
        });
        $("icon.cancel").click(function(event) {
            if($("wordlist input").length > 0) {
                event = $.Event("keydown");
                event.keyCode = 27;
                $("wordlist input").trigger(event);
            }
        });
        $(window).unbind("mousedown");
        $(window).mousedown(function(event) {
            if(event.target.tagName == "WORDLIST") {
                dragStart = [event.target];
                event.preventDefault();
                return false;
            } else if(event.target.tagName == "WORD") {
                dragStart = [$(event.target).parent("WORDLIST")[0]];
                event.preventDefault();
                return false;
            }
        });
        $(window).unbind("mouseup");
        $(window).mouseup(function(event) {
            /*if(event.target.tagName == "WORDLIST") {
                if($("wordlist.selected").length > 0) {
                    var player = $("#player")[0];
                    player.currentTime = 1.0 * $("wordlist.selected")[0].start_time;
                }
            }*/
            dragStart = null;
        });
        $(window).unbind("mousemove");
        $(window).mousemove(function(event) {
            var target = event.target;
            if(target.tagName == "WORDLIST" && dragStart && $("wordlist input").length == 0) {
                var index = $(target).index();
                $("wordlist:visible").removeClass("selected");
                if($(dragStart[dragStart.length - 1]).index() >= index) {
                    var selected = $("wordlist:visible").filter(function() {
                        return $(this).index() >= index && $(this).index() <= $(dragStart[dragStart.length - 1]).index();
                    }).addClass("selected");
                } else if($(dragStart[0]).index() <= index) {
                    var selected = $("wordlist:visible").filter(function() {
                        return $(this).index() <= index && $(this).index() >= $(dragStart[0]).index();
                    }).addClass("selected");
                }
                selectionChanged();
                event.preventDefault();
                return false;
            }
        });
        $(window).unbind("click");
        $(window).click(function(event) { // global event to automatically handle new elements 
            var target = event.target;
            if($("wordlist input").length > 0 && !($(target).parents("wordlist").is(".selected") || $(target).is(".selected"))) {
                $("icon.cancel").click();
            }
            if(target.tagName == "WORDLIST" && $("wordlist input").length == 0) {
                //if(!event.metaKey) $(event.target).parent().find("wordlist").removeClass("selected");
                $("wordlist").removeClass("selected");
                if(event.shiftKey && selectionStart != null) {
                    var index = $(target).index();
                    if($(selectionStart[selectionStart.length - 1]).index() >= index) {
                        var selected = $("wordlist:visible").filter(function() {
                            return $(this).index() >= index && $(this).index() <= $(selectionStart[selectionStart.length - 1]).index();
                        }).addClass("selected");
                        //console.log("selected %d", selected.length);
                    } else if($(selectionStart[0]).index() <= index) {
                        var selected = $("wordlist:visible").filter(function() {
                            return $(this).index() <= index && $(this).index() >= $(selectionStart[0]).index();
                        }).addClass("selected");
                        //console.log("selected %d", selected.length);
                    }
                }
                $(target).addClass("selected");
                selectionChanged(target);
                selectionChanged(target); // need a second call for proper display
                if($("wordlist.selected").length > 0) {
                    var player = $("#player")[0];
                    if($("wordlist.selected")[0].backend != undefined) {
                        player.currentTime = 1.0 * $("wordlist.selected")[0].backend.start;
                    }
                }
                event.preventDefault();
                return false;
            }
            if(event.target.tagName == "WORD" && $("wordlist input").length == 0) {
                /*$(event.target).parent().find("word").removeClass('unmodified');
                if(!$(event.target).hasClass("selected")) {
                    $(event.target).parent().find("word").removeClass("selected");
                    $(event.target).addClass("selected");
                }*/
                if(!$(event.target).is(".selected")) chooseWord(true, event.target);
                // also simulate click on wordlist
                $(event.target.parentNode).parent().find("wordlist").removeClass("selected");
                $(event.target.parentNode).addClass("selected");
                selectionChanged(event.target.parentNode);
                selectionChanged(event.target.parentNode);
                event.preventDefault();
                return false;
            }
        });
        $(window).unbind("dblclick");
        $(window).dblclick(function(event) {
            if($("wordlist input").length == 0 && (event.target.tagName == "WORD" || event.target.tagName == "WORDLIST")) {
                $(event.target).parent("wordlist").addClass("selected");
                $("icon.edit").click();
                event.preventDefault();
                return false;
            }
        });
        $(window).unbind("keydown");
        $(window).keydown(function(event) { // metaKey does not recieve keypress events
            if($("wordlist input").length == 0) {
                if(event.metaKey && event.keyCode == 90) { // ctrl-z (undo)
                    if(event.shiftKey) {
                        if(redoActions.length > 0) $("#redo").click();
                    } else {
                        if(undoActions.length > 0) $("#undo").click();
                    }
                // deactivated direct editing, must use enter or space
                /*} else if(character.match(/(\w|\d)/)) { // is a unicode letter?
                    $("icon.edit").click();
                    $("wordlist input").trigger("keydown", event);*/
                } else if(event.metaKey && event.keyCode == 65) { // ctrl-a (select all)
                    $("wordlist").addClass("selected");
                }
                event.preventDefault();
                return false;
            }
        });
        $(window).unbind("keypress");
        $(window).keypress(function(event) {
            if($("wordlist input").length == 0) {
                //var character = String.fromCharCode(event.keyCode);
                if(event.keyCode == 46) { // delete
                    $("icon.delete").click();
                } else if(event.keyCode == 32) { // space
                    if(event.metaKey) {
                        $("icon.insert").click();
                    } else {
                        var player = $("#player")[0];
                        if(player.paused) player.play();
                        else player.pause();
                    }
                } else if(event.keyCode == 13) { // enter
                    $("icon.edit").click();
                } else if(event.keyCode == 38 || event.keyCode == 40) { // up or down
                    var current = $("wordlist.selected");
                    if(current.length == 1) {
                        var words = $(current[0]).find('word');
                        var word = $(words).filter('.selected');
                        $(words).removeClass('selected');
                        if(event.keyCode == 38) {
                            var found = $(words).filter(function() { return $(this).index() < $(word).index(); }).last();
                            if(found.length == 1) $(found).addClass('selected');
                            else $(word).addClass('selected');
                        }
                        if(event.keyCode == 40) {
                            var found = $(words).filter(function() { return $(this).index() > $(word).index(); }).first();
                            if(found.length == 1) $(found).addClass('selected');
                            else $(word).addClass('selected');
                        }
                        event.preventDefault();
                        return false;
                    }
                } else if(event.keyCode == 9 || event.keyCode == 37 || event.keyCode == 39 || event.keyCode == 36 || event.keyCode == 35) { // tab or left or right or home or end
                    var selected = $("wordlist.selected");
                    if(selected.length > 0) {
                        if((event.keyCode == 9 && event.shiftKey) || event.keyCode == 37) { // shift-tab or left
                            if(selected[0].previousSibling) {
                                if(!(event.keyCode == 37 && event.shiftKey)) $(selected).removeClass("selected");
                                $(selected[0].previousSibling).addClass("selected");
                            }
                        } else if((event.keyCode == 9 && !event.shiftKey) || event.keyCode == 39) { // tab or right
                            if(selected[selected.length - 1].nextSibling) {
                                if(!(event.keyCode == 39 && event.shiftKey)) $(selected).removeClass("selected");
                                $(selected[selected.length - 1].nextSibling).addClass("selected");
                            }
                        } else if(event.keyCode == 36) { // home
                            $(selected).removeClass("selected");
                            if(event.shiftKey) {
                                $("wordlist").filter(function() {
                                    return $(this).index() <= $(selected).first().index();
                                }).addClass("selected");
                            }
                            $("wordlist").first().addClass("selected");
                        } else if(event.keyCode == 35) { // end
                            $(selected).removeClass("selected");
                            if(event.shiftKey) {
                                $("wordlist").filter(function() {
                                    return $(this).index() >= $(selected).last().index();
                                }).addClass("selected");
                            }
                            $("wordlist").last().addClass("selected");
                        }
                    } else {
                        if(event.keyCode == 35) {
                            $("wordlist").last().addClass("selected");
                        } else {
                            $("wordlist").first().addClass("selected");
                        }
                    }
                    if($("wordlist.selected").length > 0) {
                        var player = $("#player")[0];
                        player.currentTime = 1.0 * $("wordlist.selected")[0].backend.start;
                    }
                } else if(event.keyCode == 16) { // shift
                    selectionStart = $("wordlist.selected");
                } else if(event.keyCode == 27) { // escape unselect
                    $("wordlist").removeClass("selected");
                } else {
                    return true; // process the key
                }
                selectionChanged();
                event.preventDefault();
                return false;
            } else {
            }
        });
        $(window).keyup(function(event) {
            if(event.keyCode == 16 && selectionStart != null) { // shift
                selectionStart = null;
            }
        });
        $("wordlist").remove(":empty");
        $("lattice").prepend('<wordlist class="anchor">&lt;s&gt;</wordlist>');
        $("lattice").append('<wordlist class="anchor last">&lt;/s&gt;</wordlist>');
        $(".anchor").first()[0].backend = {start: current_segment.start, end: current_segment.start};
        $(".anchor").last()[0].backend = {start: current_segment.end, end: current_segment.end};
        var player = $("#player")[0];
        if(player.currentTime && current_segment) {
            player.currentTime = current_segment.start;
        }

        $("wordlist:not(.anchor)").first().addClass("selected");
        
        // setup height
        // change css directly so that future wordlists have the same height
        var rules = document.styleSheets[1].cssRules;
        for(var i = 0; i < rules.length; i++) {
            if(rules[i].selectorText == "wordlist") {
                rules[i].style.height = null;
            } else if(rules[i].selectorText == "wordlist.anchor") {
                rules[i].style.height = null;
            }
        }
        max = 0;
        $("wordlist").each(function() {
            if($(this).height() > max) max = $(this).height();
        });
        max += 10;
        // change css directly so that future wordlists have the same height
        var rules = document.styleSheets[1].cssRules;
        for(var i = 0; i < rules.length; i++) {
            if(rules[i].selectorText == "wordlist") {
                rules[i].style.height = max + "px";
            } else if(rules[i].selectorText == "wordlist.anchor") {
                rules[i].style.height = (max - 5) + "px";
            }
        }

        selectionChanged();
        selectionChanged();
    }
    function populateShowname() {
        $.getJSON("/dialogs", {}, function(dialogs) {
            var element = $("#showname")[0];
            $(element).empty();
            //dialogs.sort(function(a, b) {return a.name.split(".")[0] - b.name.split(".")[0];});
            for(var i = 0; i < dialogs.length; i++) {
                $(element).append('<option ' + (i == 0 ? "checked" : "") + '>' + dialogs[i] + '</option>');
            }
            $(element).change(function() {
                undoActions = [];
                redoActions = [];
                $("#undo").button("disable");
                $("#redo").button("disable");
                var value = $(this).val();
                var player = $("#player")[0];
                if(player.canPlayType('audio/mp3')) {
                    player.setAttribute("src", "audio/" + value.split(".")[0] + ".mp3");
                    //player.src = "http://lium3/~favre/player/audio/" + value.split(".")[0] + ".mp3";
                } else {
                    player.setAttribute("src", "audio/" + value.split(".")[0] + ".ogg");
                    //player.src = "http://lium3/~favre/player/audio/" + value.split(".")[0] + ".ogg";
                }
                player.load();
                $("#spectrogram")[0].setAttribute("src", "spectrogram/" + value.split(".")[0] + ".html");
                $.getJSON("/dialog?name=" + value, {}, function(dialog) {
                    current_dialog = dialog;
                    var sentences = $("#sentences")[0];
                    $(sentences).empty();
                    for(var j = 0; j < dialog.segments.length; j++) {
                        last_modified = "";
                        var segment = dialog.segments[j];
                        if(segment.last_modified) {
                            last_modified = '<span class="last_modified"> Last modified: ' + segment.last_modified + ' </span>';
                        }
                        $(sentences).append('<sentence class="clickable" title="' + segment.name + '"><placeholder title="' + segment.name + '" segment="' + dialog.name + '" sentence="' + segment.name +'" sentence_index="' + j +'">' + segment.start + "-" + segment.end + last_modified + "<br>" + segment.text + '</placeholder></sentence>');
                    }
                    $("sentence").click(function() {
                        if($(this).find("lattice").length == 0) {
                            $("#player")[0].pause();
                            if(undoActions.length > 0 && confirm("Sentence modified. Do you want to save?")) {
                                saveSentence(this);
                            }
                            $("sentence").removeClass("selected");
                            $("sentence").addClass("clickable");
                            $(this).removeClass("clickable");
                            $(this).addClass("selected");
                            var placeholder = $(this).find("placeholder")[0];
                            current_sentence = placeholder.getAttribute("sentence");
                            $.getJSON("/segment?name=" + current_sentence, {}, function(segment) {
                                current_segment = segment;
                                $("#player")[0].currentTime = segment.start;
                                $("lattice").remove();
                                $("#segmentation").remove();
                                $("#save_sentence").remove();
                                $("placeholder").show();
                                $(placeholder).hide();
                                //$("placeholder").show();
                                var sentence = $(placeholder).parent()[0];
                                //$(placeholder).hide();
                                $(sentence).append("<lattice></lattice>");
                                $(sentence).append('<button id="segmentation" title="Edit segmentation (Ctrl-e)">Edit segmentation</button><button id="save_sentence" title="Save sentence (Ctrl-s)">Save sentence</button>');
                                $("#segmentation").button().click(function() {
                                    alert("Not implemented yet");
                                    return false;
                                });
                                $("#save_sentence").button({disabled:true}).click(function() {
                                    saveSentence($(this).parent("sentence"));
                                    return false;
                                });
                                setupLattice(segment);
                            });
                        }
                    });
                    selectionChanged();
                });
                selectionChanged();
            }).change();
        });
    }
    $(document).ready(function() {
        populateShowname();
    });

