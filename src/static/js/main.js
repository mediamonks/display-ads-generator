(function () {
    /* variables */
    var socket = io();
    var messages = document.getElementById('messages');

    /* functions */
    function toggleCardVis(card) {
        $(".cards").hide();
        card.show();
    }

    function getSelectValues(select) {
        console.log(select)
        var result = [];
        var options = select && select.options;
        var opt;

        for (var i = 0, iLen = options.length; i < iLen; i++) {
            opt = options[i];

            if (opt.selected) {
                var theObj = {
                    name: opt.innerHTML,
                    location: opt.value || opt.text
                }
                result.push(theObj);
            }
        }
        return result;
    }

    /* button events */
    $('#getTemplateBtn').click(function () {
        socket.emit('grabTemplate', {
            input_template: $('#input_template').val(),
            input_username: $('#input_username').val(),
            input_password: $('#input_password').val(),
            input_branch: $('#input_branch').val(),
            input_feed: $('#input_feed').val()
        });

        $("#form :input").prop("disabled", true);
    });


    $('#generateZips').click(function (e) {

        var selectedAdsArray = $('#configList :selected').map(function (index, element) {
            return {
                location: element.value,
                status: 'In Progress',
                zip: 'In Progress',
                name: element.innerHTML
            };
        }).get();

        socket.emit('generateAds', {
            input_feed: $('#input_feed').val(),
            selectedAds: selectedAdsArray,

            preserve_filenames: $('#preserve_filenames').prop('checked'),

            optimizations: {
                html: $('#minify_html').prop('checked'),
                css: $('#minify_css').prop('checked'),
                js: $('#minify_javascript').prop('checked'),
                image: $('#optimize_images').prop('checked'),
                fonts: $('#optimize_fonts').prop('checked')
            },
        });

        $("#form2 :input").prop("disabled", true);

        toggleCardVis($("#card3"));

        // updateTable(selectedAdsArray);

    });

    function updateTable(adData) {
        console.log(adData);
        $("#ads tbody").empty();


        for (var ad of adData) {
            var tableRowString =
                "<tr>" +
                    "<td>" + ad.name + "</td>" +
                    "<td>" + ad.outputName + "</td>" +
                    "<td>" + ad.html + "</td>" +
                    "<td>" + ad.preview + "</td>" +
                    "<td>" + ad.zip + "</td>" +
                    "<td>" + ad.video + "</td>" +
                    "<td>" + ad.gif + "</td>" +
                    "<td>" + ad.jpg + "</td>" +
                "</tr>";

            $('#ads tbody').append(tableRowString);

        }


    }
    socket.on('list ads', function (msg) {
        toggleCardVis($("#card2"));

        for (var i = 0; i < msg.data.length; i++) {
            $("#configList").append("<option value=" + msg.data[i].location + ">" + msg.data[i].baseName + "</option>");
        }

        var selectSize = msg.data.length < 20 ? msg.data.length : 20;
        $("#configList").prop("size", selectSize);

    });


    socket.on('ads built', function (msg) {
        updateTable(msg.data);
    });

    socket.on('update message', function (msg) {
        var item = document.createElement('li');
        item.innerHTML = msg.data;
        // messages.appendChild(item);
        //messages.insertBefore(item, messages.firstChild);

        window.scrollTo(0, document.body.scrollHeight);
        console.log(msg.data)
    });


    toggleCardVis($("#card1"));


})();

