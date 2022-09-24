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
var self = this;

// for api call
var assert = require('assert');
var path = require('path');

// app.post('/place_bet',
//     function (req, res, next) {
//         res.status(500).json({  // invalid cashout response
//             status_code: 500,
//             status: false,
//             message: "Invalid CashOut value",
//         })
//         console.log("here here", req)
//         // db.placeBet(betAmount, autoCashOut, user.id, self.gameId, function (err, playId) {
//         //     // BET PLACE HERE
//         // });
//     }
// )

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
    server = require('http').createServer(
        function (request, response) {
            if (request.method == 'POST') {
                var body = '';
                request.on('data', function (data) {
                    body += data;
                });
                request.on('end', function () {
                    try {
                        var post = JSON.parse(body);
                        response.writeHead(200, { "Content-Type": "application/json" });
                        // database.placeBet(betAmount, autoCashOut, user.id, self.gameId, function (err, playId) {
                        //     // BET PLACE HERE
                        // });
                        // console.log("here", ); // <--- here I just output the parsed JSON
                        self.game.placeBetSMS(post.betAmount, post.autoCashOut, post.userID, post.msisdn, post.playing, post.user);
                        response.end('post received')
                        return;
                    } catch (err) {
                        response.writeHead(500, { "Content-Type": "application/json" });
                        response.end();
                        return;
                    }
                });
            }
        }

    ).listen(config.PORT, function () {
        console.log('Listening on port ', config.PORT, ' with http');
    });
}

async.parallel([
    database.getGameHistory,
    database.getLastGameInfo,
    database.getBankroll
], function (err, results) {
    if (err) {
        console.error('[INTERNAL_ERROR] got error: ', err,
            'Unable to get table history');
        throw err;
    }

    var gameHistory = new GameHistory(results[0]);
    var info = results[1];
    var bankroll = results[2];

    console.log('Have a bankroll of: ', bankroll / 1e8, ' btc');

    var lastGameId = info.id;
    var lastHash = info.hash;
    assert(typeof lastGameId === 'number');

    self.game = new Game(lastGameId, lastHash, bankroll, gameHistory);
    var chat = new Chat();
    socket(server, self.game, chat);
    // 
    // console.log('Game server started');



});