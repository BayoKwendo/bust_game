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

    db.query('SELECT id, promo_code,username FROM users', function (err, res) {
        if (err) return console.log(err);
        for (let j = 0; j < res.rows.length; j++) {

            var user_id = res.rows[j].id;
            console.log("DONE", user_id)

            db.query(`UPDATE users set total_deposit = (select CASE WHEN sum(amount) > 0 THEN sum(amount) ELSE 0 END AS amount from fundings where amount > 0 and status = 'success' and user_id = $1), total_withdrawal = (select CASE WHEN sum(amount * -1) > 0 THEN sum(amount * -1) ELSE 0 END AS amount from fundings where amount < 0 and status = 'success' and user_id = $1) WHERE id = $2;`, [user_id, user_id], function (err, resp) {
                if (err) return console.log(err);
                // console.log("DONE", user_id)
            })
        }
        // console.log(results.rows[i].username)

    });
}

loop();