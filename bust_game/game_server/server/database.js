var assert = require('assert');
var uuid = require('uuid');

var async = require('async');
var lib = require('./lib');
var pg = require('pg');
var config = require('./config');

if (!config.DATABASE_URL)
    throw new Error('must set DATABASE_URL environment var');

console.log('DATABASE_URL: ', config.DATABASE_URL);

// Increase the client pool size. At the moment the most concurrent
// queries are performed when auto-bettors join a newly created
// game. (A game is ended in a single transaction). With an average
// of 25-35 players per game, an increase to 20 seems reasonable to
// ensure that most queries are submitted after around 1 round-trip
// waiting time or less.
pg.defaults.poolSize = 20;

// The default timeout is 30s, or the time from 1.00x to 6.04x.
// Considering that most of the action happens during the beginning
// of the game, this causes most clients to disconnect every ~7-9
// games only to be reconnected when lots of bets come in again during
// the next game. Bump the timeout to 2 min (or 1339.43x) to smooth
// this out.
pg.defaults.poolIdleTimeout = 120000;

pg.types.setTypeParser(20, function (val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});

pg.types.setTypeParser(1700, function (val) { // parse numeric as a float
    return val === null ? null : parseFloat(val);
});

// callback is called with (err, client, done)
function connect(callback) {
    return pg.connect(config.DATABASE_URL, callback);
}

function query(query, params, callback) {
    //third parameter is optional
    if (typeof params == 'function') {
        callback = params;
        params = [];
    }

    doIt();
    function doIt() {
        connect(function (err, client, done) {
            if (err) return callback(err);
            client.query(query, params, function (err, result) {
                done();
                if (err) {
                    if (err.code === '40P01') {
                        console.log('Warning: Retrying deadlocked transaction: ', query, params);
                        return doIt();
                    }
                    return callback(err);
                }

                callback(null, result);
            });
        });
    }
}

function getClient(runner, callback) {
    doIt();

    function doIt() {
        connect(function (err, client, done) {
            if (err) return callback(err);

            function rollback(err) {
                client.query('ROLLBACK', done);

                if (err.code === '40P01') {
                    console.log('Warning: Retrying deadlocked transaction..');
                    return doIt();
                }

                callback(err);
            }

            client.query('BEGIN', function (err) {
                if (err)
                    return rollback(err);

                runner(client, function (err, data) {
                    if (err)
                        return rollback(err);

                    client.query('COMMIT', function (err) {
                        if (err)
                            return rollback(err);

                        done();
                        callback(null, data);
                    });
                });
            });
        });
    }
}


exports.query = query;

pg.on('error', function (err) {
    console.error('POSTGRES EMITTED AN ERROR', err);
});

// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

// callback takes (err, data)





exports.updateBetLogs = function (userId, bet_amount, gameId, callback) {  // update bet logs

    getClient(function (client, callback) {

        client.query("SELECT balance_satoshis, referred_income, bonus FROM users_view WHERE id = $1", // update user wallet
            [userId], function (err, response) {
                if (err) return callback(err);
                var mbalance = response.rows[0].balance_satoshis
                var referral = response.rows[0].referred_income
                var bonus = response.rows[0].bonus
                query('INSERT INTO customer_logs_view(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                    [userId, `${bet_amount} loss bet: game id ${gameId}`, mbalance, referral, bonus, (mbalance + referral + bonus)],
                    function (err, response) {
                        if (err) return callback(err);
                        client.query(
                            'INSERT INTO bet_log_view(user_id, game_id, bet, balance, narrative ) VALUES($1, $2, $3, $4, $5)',
                            [userId, gameId, bet_amount, mbalance, `Loss bet ${bet_amount}`],
                            function (err, response) {
                                if (err) return callback(err);
                                callback(null)
                            })

                    })
            });

        // client.query(
        //     'SELECT balance_satoshis FROM users WHERE id = $1',
        //     [userId],

        //     function (err, result) {
        //         if (err) return callback(new Error('Could not end game, got: ' + err));

        //         var current_balance = result.rows[0].balance_satoshis;
        //         client.query(
        //             'INSERT INTO bet_log(user_id, game_id, bet, balance, narrative ) VALUES($1, $2, $3, $4, $5)',
        //             [userId, gameId, bet_amount, current_balance, `Loss bet ${bet_amount}`], callback)
        //         callback(null);
        //     });
    }, callback);
};




exports.getLastGameInfo = function (callback) {
    query('SELECT MAX(id) id FROM games', function (err, results) {
        if (err) return callback(err);
        assert(results.rows.length === 1);

        var id = results.rows[0].id;
        if (!id || id < 1e6) {
            return callback(null, {
                id: 1e6 - 1,
                hash: 'c1cfa8e28fc38999eaa888487e443bad50a65e0b710f649affa6718cfbfada4d'
            });
        }
        console.log(id)
        query('SELECT hash FROM game_hashes WHERE game_id = $1 limit 1', [id], function (err, results) {
            if (err) return callback(err);

            assert(results.rows.length === 1);

            callback(null, {
                id: id,
                hash: results.rows[0].hash
            });
        });
    });
};
// 999999999
// 1000999
exports.getUserByName = function (username, callback) {
    assert(username);
    query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], function (err, result) {
        if (err) return callback(err);
        if (result.rows.length === 0)
            return callback('USER_DOES_NOT_EXIST');
        assert(result.rows.length === 1);
        callback(null, result.rows[0]);
    });
};

exports.getBalance = function (user_id, callback) {
    query('SELECT * FROM users WHERE id = $1', [user_id], function (err, result) {
        if (err) return callback(err);
        callback(null, result.rows[0]);
    });
};

exports.validateOneTimeToken = function (token, callback) {
    assert(token);

    query('WITH t as (UPDATE sessions SET expired = now() WHERE id = $1 AND ott = TRUE RETURNING *)' +
        'SELECT * FROM users WHERE id = (SELECT user_id FROM t)',
        [token], function (err, result) {
            if (err) return callback(err);
            if (result.rowCount == 0) return callback('NOT_VALID_TOKEN');
            assert(result.rows.length === 1);
            callback(null, result.rows[0]);
        }
    );
};

//add by lt
exports.unread_count = function (uid, callback) {
    query('SELECT * FROM users_view WHERE id = $1',
        [uid], function (err, result) {
            if (err) return callback(err);
            if (result.rowCount == 0) return callback('NOT_VALID_TOKEN');
            assert(result.rows.length === 1);
            callback(null, result.rows[0]);
        }
    );
};

exports.placeBet = function (amount, autoCashOut, userId, gameId, callback) {
    assert(typeof amount === 'number');
    assert(typeof autoCashOut === 'number');
    assert(typeof userId === 'number');
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');

    getClient(function (client, callback) {
        var tasks = [
            function (callback) {
                client.query('UPDATE users_view SET balance_satoshis = balance_satoshis - $1 WHERE id = $2',
                    [amount, userId], callback);
            },
            function (callback) {
                client.query(
                    'INSERT INTO plays_view(user_id, game_id, bet, auto_cash_out) VALUES($1, $2, $3, $4) RETURNING id',
                    [userId, gameId, amount, autoCashOut], callback);
            },
            function (callback) {
                saveBet(client, userId, amount, gameId, function (err) {
                    if (err)
                        return callback(err);
                    callback(null);
                })
            },
            // function (callback) {
            //     client.query(
            //         'SELECT balance_satoshis FROM users WHERE id = $1',
            //         [userId],
            //         function (err, result) {
            //             if (err) return callback(new Error('Could not end game, got: ' + err));
            //             var current_balance = result.rows[0].balance_satoshis;
            //             client.query(
            //                 'INSERT INTO bet_log(user_id, game_id, bet, balance, narrative ) VALUES($1, $2, $3, $4, $5)',
            //                 [userId, gameId, amount, current_balance, `Inititiate bet of ${amount}`], callback)
            //         })
            // }
        ];

        async.parallel(tasks, function (err, result) {
            if (err)
                return callback(err);

            // console.log("result", result)    
            var playId = result[1].rows[0].id;
            assert(typeof playId === 'number');

            console.log("play", playId)

            callback(null, playId);
        });
    }, callback);
};


var endGameQuery =
    'WITH vals AS ( ' +
    ' SELECT ' +
    ' unnest($1::bigint[]) as user_id, ' +
    ' unnest($2::bigint[]) as play_id, ' +
    ' unnest($3::bigint[]) as bonus ' +
    '), p AS (' +
    ' UPDATE plays SET bonus = vals.bonus FROM vals WHERE id = vals.play_id RETURNING vals.user_id ' +
    '), u AS (' +
    ' UPDATE users SET balance_satoshis = balance_satoshis + vals.bonus ' +
    ' FROM vals WHERE id = vals.user_id RETURNING vals.user_id ' +
    ') SELECT COUNT(*) count FROM p JOIN u ON p.user_id = u.user_id';

exports.endGame = function (gameId, crashPoint, bonuses, callback) {
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');


    getClient(function (client, callback) {
        client.query('UPDATE games SET ended = true, game_crash = $1 WHERE id = $2', [crashPoint, gameId],
            function (err) {
                if (err) return callback(new Error('Could not end game, got: ' + err));
                client.query('UPDATE users_view SET playing = $1 WHERE playing = $2', [0, 1],
                    function (err) {
                        console.log(err)
                        var userIds = [];
                        var playIds = [];
                        var bonusesAmounts = [];

                        bonuses.forEach(function (bonus) {
                            assert(lib.isInt(bonus.user.id));
                            userIds.push(bonus.user.id);
                            assert(lib.isInt(bonus.playId));
                            playIds.push(bonus.playId);
                            //assert(lib.isInt(bonus.amount) && bonus.amount > 0);
                            bonusesAmounts.push(0);
                        });

                        assert(userIds.length == playIds.length && playIds.length == bonusesAmounts.length);

                        if (userIds.length === 0)
                            return callback();

                        console.log("bonues", bonusesAmounts)
                        client.query(endGameQuery, [userIds, playIds, bonusesAmounts], function (err, result) {
                            if (err)
                                return callback(err);

                            if (result.rows[0].count !== userIds.length) {
                                throw new Error('Mismatch row count: ' + result.rows[0].count + ' and ' + userIds.length);
                            }

                            callback();
                        });


                    });

            });
    }, callback);

};

exports.addOutgoingSMS = function (userId, message, callback) {
    var sql = 'INSERT INTO outgoing_sms (user_id, narrative ) values($1, $2)';
    query(sql, [userId, message], function (err, res) {
        if (err)
            return callback(err);

        console.log("here")
        assert(res.rowCount === 1);
        callback(null);
    });
};

function addSatoshis(client, userId, amount, callback) {

    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount, userId], function (err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);
        callback(null);
    });
}

function customerlogs(client, userId, amount, mbalance, referral, bonus, callback) {

    client.query('INSERT INTO customer_logs_view(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
        [userId, `Cashed out ${amount} total balance ${mbalance}`, mbalance, referral, bonus, (mbalance + referral + bonus)],
        function (err, response) {
            callback(null);

        });
}


function saveBet(client, userId, amount, gameId, callback) {

    client.query("SELECT balance_satoshis, referred_income, bonus FROM users_view WHERE id = $1", // update user wallet
        [userId], function (err, response) {
            if (err) return callback(err);
            var mbalance = response.rows[0].balance_satoshis
            var referral = response.rows[0].referred_income
            var bonus = response.rows[0].bonus
            query('INSERT INTO customer_logs_view(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                [userId, `${amount} used to place bet: game id ${gameId}`, mbalance, referral, bonus, (mbalance + referral + bonus)],
                function (err, response) {
                    if (err) return callback(err);
                    client.query(
                        'INSERT INTO bet_log_view(user_id, game_id, bet, balance, narrative ) VALUES($1, $2, $3, $4, $5)',
                        [userId, gameId, amount, mbalance, `Inititiate bet of ${amount}`],
                        function (err, response) {
                            if (err) return callback(err);
                            callback(null);
                        })

                })
        });
}



exports.cashOut = function (userId, playId, amount, bet_amount, callback) {
    assert(typeof userId === 'number');
    assert(typeof playId === 'number');
    assert(typeof amount === 'number');
    assert(typeof callback === 'function');

    getClient(function (client, callback) {
        addSatoshis(client, userId, amount, function (err) {
            if (err)
                return callback(err);

            client.query(
                'UPDATE plays SET cash_out = $1 WHERE id = $2 AND cash_out IS NULL',
                [amount, playId], function (err, result) {
                    if (err)
                        return callback(err);

                    if (result.rowCount !== 1) {
                        console.error('[INTERNAL_ERROR] Double cashout? ',
                            'User: ', userId, ' play: ', playId, ' amount: ', amount,
                            ' got: ', result.rowCount);

                        return callback(new Error('Double cashout'));
                    }
                    client.query('SELECT game_id FROM plays WHERE id = $1', [playId], function (err, results) {
                        if (err) return callback(err);
                        var gameId = results.rows[0].game_id;
                        let mamount = amount;  // update to whole stake
                        // console.log("basket amount ", mamount)
                        client.query(
                            'UPDATE basket SET amount = amount - $1', [mamount], function (err, result) {   // update busket on winings
                                if (err) {
                                    // console.log("basket amount ", err)
                                    return callback(err)
                                }
                                client.query(
                                    'SELECT amount FROM basket',
                                    function (err, res) {
                                        if (err) {
                                            // console.log("basket amount ", err)
                                            return callback(err)
                                        }

                                        var balance = res.rows[0].amount

                                        client.query('INSERT INTO basket_log(amount, game_id, balance, narrative) VALUES($1, $2,  $3, $4)',
                                            [mamount, gameId, balance, `deduct ${mamount} from the basket:- game id ${gameId}`], function (err) { // insert into basket logs
                                                if (err) return callback(err);

                                                client.query("SELECT balance_satoshis, referred_income, bonus FROM users_view WHERE id = $1", // update user wallet
                                                    [userId], function (err, response) {
                                                        if (err) return callback(err);
                                                        var mbalance = response.rows[0].balance_satoshis
                                                        var referral = response.rows[0].referred_income
                                                        var bonus = response.rows[0].bonus

                                                        customerlogs(client, userId, amount, mbalance, referral, bonus, function (err) {
                                                            if (err)
                                                                return callback(err);

                                                            client.query(
                                                                'INSERT INTO bet_log_view(user_id, game_id, bet, cashout, balance, narrative ) VALUES($1, $2, $3, $4, $5, $6)',
                                                                [userId, gameId, bet_amount, mamount, mbalance, `Cashed out ${amount} total balance ${mbalance}`],
                                                                function (err, result) {
                                                                    if (err) return callback(new Error('Could not end game, got: ' + err));
                                                                    callback(null);
                                                                });
                                                        })
                                                    });

                                            });
                                    });
                            });
                    })

                }
            );
        });
    }, callback);
};


// callback called with (err, { crashPoint: , hash: })
exports.createGame = function (gameId, callback) {
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');


    query('SELECT hash FROM game_hashes WHERE game_id = $1 limit 1', [gameId], function (err, results) {
        if (err) return callback(err);

        if (results.rows.length !== 1) {
            console.error('[INTERNAL_ERROR] Could not find hash for game ', gameId);
            return callback('NO_GAME_HASH');
        }

        var hash = results.rows[0].hash;
        var gameCrash = lib.crashPointFromHash(hash);
        assert(lib.isInt(gameCrash));

        query('SELECT count(*) as gnum from games where created between current_date and current_date+1', [], function (err, result) {
            if (err) return callback(err);
            var gnum = result.rows[0].gnum;
            query('INSERT INTO games(id, game_crash,game_no) VALUES($1, $2, $3)',
                [gameId, gameCrash, gnum + 1], function (err) {
                    if (err) return callback(err);
                    query('SELECT * FROM plays WHERE game_id = $1', [gameId], function (err, row) {
                        if (err) return callback(err);
                        return callback(null, { crashPoint: gameCrash, hash: hash, gameno: gnum + 1, bets: row.rows });
                    });
                });
        });
    });
};





exports.getGameLogs = function (callback) {  // update bet logs
    getClient(function (client, callback) {
        client.query('select * from games order by id desc limit 6',
            function (err, response) {
                if (err) return callback(err);

                callback(null, response.rows)
            })
    }, callback);
};

exports.calculateStake = function (gameId, gameCrash, callback) {
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');

    query('SELECT SUM(bet) as stake, SUM(bet*auto_cash_out) as max_winnings FROM plays_view WHERE game_id = $1', [gameId], function (err, result) {
        if (err) return callback(err);
        // console.log("result from plays", result.rows[0].stake)
        if (result.rows[0].stake > 0) {

            var total_stake = result.rows[0].stake;  // total stake amount

            var total_wining = result.rows[0].max_winnings; // total winings calculated

            var house_income = total_stake * config.VIG;  // house income

            // console.log("house income", house_income)

            var basket_amount = total_stake - house_income; // basket value

            var new_crashpoint = 0;

            query('UPDATE houseincome SET amount = amount + $1 , last_updated_on = NOW()', [house_income], function (err) {  // update house income
                if (err) return callback(err);

                query('SELECT amount FROM houseincome', function (err, result) {
                    if (err) return callback(err);
                    var possible_winings = result.rows[0].amount  // amount in the basket to be won

                    query('INSERT INTO houseincome_log (amount, game_id,narrative, balance) VALUES($1, $2, $3, $4)',
                        [house_income, gameId, `House income added of game id ${gameId}`, possible_winings], function (err) {  // insert into house income logs
                            if (err) return callback(err);
                            query('UPDATE basket SET amount = amount + $1, last_updated_on = NOW()', [basket_amount], function (err, result) {  // update basket
                                if (err) return callback(err);

                                query('SELECT amount FROM basket', function (err, result) {
                                    if (err) return callback(err);
                                    var basket_balance = result.rows[0].amount  // amount in the basket to be won
                                    query('INSERT INTO basket_log (amount, game_id, balance, narrative) VALUES($1, $2, $3, $4)',
                                        [basket_amount, gameId, basket_balance, `${basket_amount} added to the basket:- game id ${gameId}`], function (err) { // insert into basket logs
                                            if (err) return callback(err);

                                            if (basket_balance > total_wining) {   // if amount in the bassket is enough than all possible cashing

                                                // console.info("baskets total winning " + basket_balance + "  " + total_wining)
                                                gameCrash = basket_balance / total_wining;
                                                if (gameCrash > 100) {
                                                    new_crashpoint = 100
                                                } else {
                                                    new_crashpoint = gameCrash
                                                }
                                                // console.info("gamecrasg ", gameCrash)
                                            } else {
                                                var point = basket_balance / total_stake;

                                                console.info("baskets stake " + basket_balance + "  " + total_stake)

                                                console.info("point ", point)

                                                if (point <= 1) {

                                                    new_crashpoint = 1.01;  // 
                                                
                                                } else {
                                                    // new_crashpoint = point
                                                    if (point > 100) {  // greater than handred
                                                        new_crashpoint = 100
                                                    } else {
                                                        new_crashpoint = point
                                                    }
                                                }
                                            }





                                            console.log("new crashpoint", new_crashpoint)
                                            return callback(null, { crashPoint: new_crashpoint });
                                            // });
                                        })
                                });
                            });

                        });
                });
            });

        } else {
            return callback(null, { crashPoint: gameCrash });
        }

    });

};

/*
exports.getServerProfit = function(callback) {
    query('SELECT server_profit FROM money',
        function(err, results) {
            if (err) return callback(err);
 
            assert(results.rows.length === 1);
 
            var profit = results.rows[0].server_profit;
            assert(typeof profit === 'number');
 
            callback(null, profit);
        }
    );
 
};
*/
exports.getBankroll = function (callback) {
    query('SELECT COALESCE(SUM(balance_satoshis), 0) as profit FROM users',
        function (err, results) {
            if (err) return callback(err);

            assert(results.rows.length === 1);

            var profit = results.rows[0].profit;
            assert(typeof profit === 'number');

            var min = 1e8;

            callback(null, Math.max(min, profit));
        }
    );

};

exports.getGameHistory = function (callback) {

    var sql =
        'SELECT games.id game_id, (games.game_crash/100) game_crash, games.created, games.game_no,(SELECT hash FROM game_hashes WHERE game_id = games.id limit 1),(SELECT to_json(array_agg(to_json(pv)))  FROM (SELECT username, bet, (1 * cash_out / bet) AS stopped_at, plays.bonus  FROM plays INNER JOIN users ON user_id = users.id WHERE game_id = games.id) pv) player_info FROM games  INNER JOIN plays on games.id = plays.game_id WHERE games.ended = true ORDER BY games.id DESC LIMIT 10;';
    query(sql, function (err, data) {
        if (err) throw err;

        data.rows.forEach(function (row) {
            // oldInfo is like: [{"username":"USER","bet":satoshis, ,..}, ..]
            var oldInfo = row.player_info || [];
            var newInfo = row.player_info = {};

            oldInfo.forEach(function (play) {
                newInfo[play.username] = {
                    bet: play.bet,
                    stopped_at: play.stopped_at,
                    bonus: play.bonus
                };
            });
        });

        callback(null, data.rows);
    });
};

exports.getGameHistory1 = function (uid, callback) {

    console.log("test", uid)
    var sql =
        ' SELECT games.id game_id, games.game_crash, games.created, games.game_no, ' +
        '(SELECT hash FROM game_hashes WHERE game_id = games.id limit 1), ' +
        '(SELECT to_json(array_agg(to_json(pv))) ' +
        ' FROM (SELECT username, bet, (1 * cash_out / bet) AS stopped_at, plays.bonus ' +
        ' FROM plays JOIN users ON user_id = users.id WHERE game_id = games.id ) pv) player_info ' +
        ' FROM games inner join plays  on games.id = plays.game_id ' +
        ' WHERE games.ended = true and date(games.created) = current_date and plays.user_id = $1 ' +
        ' ORDER BY games.id DESC LIMIT 600';

    query(sql, [uid], function (err, data) {
        if (err) throw err;

        data.rows.forEach(function (row) {
            // oldInfo is like: [{"username":"USER","bet":satoshis, ,..}, ..]
            var oldInfo = row.player_info || [];
            var newInfo = row.player_info = {};

            oldInfo.forEach(function (play) {
                newInfo[play.username] = {
                    bet: play.bet,
                    stopped_at: play.stopped_at,
                    bonus: play.bonus
                };
            });
        });

        callback(null, data.rows);
    });
};
exports.getHashTable = function (offset, limit, callback) {

    var sql = "SELECT game_id,hash,game_crash FROM game_hashes ORDER BY game_id ASC limit $1 OFFSET $2";
    query(sql, [limit, offset], function (err, data) {
        if (err) {
            return callback(err);
        }

        callback(null, data.rows);
    });
};

exports.updateMoney = function (maxProfit, serverProfit) {
    assert(typeof maxProfit === 'number');
    assert(typeof serverProfit === 'number');

    query('UPDATE money SET max_profit = $1,server_profit = $2', [maxProfit, serverProfit], function (err, results) {
        console.log(err);
        return;
    });
};
//add by lt
exports.getVirUsers = function (callback) {
    query('SELECT * FROM users_view WHERE userclass = $1 and betisok = $2', ['v_user', '0'], function (err, data) {
        if (err) return callback('NO USER');

        if (data.rows.length === 0)
            return callback('NO USER');

        callback(null, data.rows);
    });
};
exports.maxmoney = function (callback) {
    query('SELECT max_profit FROM money', [], function (err, result) {
        if (err) return callback(err);
        var maxmoneyl
        if (result.rows.length === 0) maxmoney = 0;
        else maxmoney = result.rows[0].max_profit;

        callback(null, maxmoney);
    });
};
exports.changePoint = function (username, callback) {
    var sql = "UPDATE users SET balance_satoshis = balance_satoshis + point, point = point- point  WHERE username=$1";
    query(sql, [username], function (err, result) {
        if (err) return callback(err);
    });
};
