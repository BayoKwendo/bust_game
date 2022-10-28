var async = require('async');
var assert = require('assert');
var constants = require('constants');
var fs = require('fs');
var path = require('path');

var config = require('./server/config');
var socket = require('./server/socket');
var database = require('./server/database');
var Game = require('./server/game');
var Chat = require('./server/chat');
var GameHistory = require('./server/game_history');
var GameHistory1 = require('./server/game_history1');
var async = require('async');
var db = require('./server/database');
var lib = require('./server/lib');
var _ = require('lodash');


var _ = require('lodash');

var server;

if (config.USE_HTTPS) {
    var options = {
        key: fs.readFileSync(config.HTTPS_KEY),
        cert: fs.readFileSync(config.HTTPS_CERT),
        secureProtocol: 'SSLv23_method',
        secureOptions: constants.SSL_OP_NO_SSLv3 | constants.SSL_OP_NO_SSLv2
    };

    if (config.HTTPS_CA) {
        options.ca = fs.readFileSync(config.HTTPS_CA);
    }

    server = require('https').createServer(options).listen(config.PORT, function () {
        console.log('Listening on port ', config.PORT, ' on HTTPS!');
    });
} else {
    server = require('http').createServer().listen(config.PORT, function () {
        console.log('Listening on port ', config.PORT, ' with http');
    });
}
// var offset = 1010000;

var games = 1000000000000000000;  // You might want to make this 10M for a prod setting..
var game = games;
var serverSeed = 'DO NOT USE THIS SEED';


function stringGen(len) {
    var text = " ";
    var charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++)
        text += charset.charAt(Math.floor(Math.random() * charset.length));
    return text;
}


function loop(cb) {
    var parallel = Math.min(game, 1000);
    var inserts = _.range(parallel).map(function () {
        return function (cb) {
            // console.log(offset + game)

            // next to be 7
            var ref = stringGen(7).replace(" ", "").toUpperCase();
            // console.log(ref)
            db.query('INSERT INTO promocode_generate(promo) VALUES($1)', [ref], cb);
        };
    });

    async.parallel(inserts, function (err) {
        if (err) throw err;

        // Clear the current line and move to the beginning.
        var pct = 100 * (games - game) / games;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
            "Processed: " + (games - game) + ' / ' + games +
            ' (' + pct.toFixed(2) + '%)');

        if (game > 0)
            loop(cb);
        else {
            console.log(' Done');
            cb();
        }
    });
}


loop(function () {
    console.log('Finished with serverseed: ', serverSeed);
});