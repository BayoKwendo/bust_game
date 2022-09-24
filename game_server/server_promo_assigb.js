// var async = require('async');
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

const timer = ms => new Promise(res => setTimeout(res, ms))

// update user with promo codes
async function loop() {

    db.query('SELECT id, promo_code,username FROM users', function (err, results) {
        if (err) return console.log(err);

        db.query('SELECT id, promo FROM promocode_generate LIMIT $1', [results.rows.length], function (err, res) {
            if (err) return console.log(err);
            for (let j = 0; j < res.rows.length; j++) {

                var resu = res.rows[j].promo;
                var rest_id = res.rows[j].id;
                console.log("res", resu)
                db.query('UPDATE users set promo_code = $1  WHERE id = $2', [resu, results.rows[j].id], function (err, resp) {
                    if (err) return console.log(err);
                    db.query('DELETE FROM promocode_generate WHERE promo = $1', [resu], function (err, resp) {
                        if (err) return console.log(err);
                    })
                    // console.log("DONE", resu)
                })
            }
        })
        // console.log(results.rows[i].username)

    });
}

loop();