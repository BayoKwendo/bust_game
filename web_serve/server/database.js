var assert = require('assert');
var uuid = require('uuid');
var config = require('../config/config');

var async = require('async');
var lib = require('./lib');
var pg = require('pg');
var passwordHash = require('password-hash');
var speakeasy = require('speakeasy');
var m = require('multiline');

var util = require('util');

var request = require('request');

var databaseUrl = config.DATABASE_URL;

function formatDecimals(amount) {
    return (parseFloat(amount)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        // style:"currency",
        currency: 'KES',
        maximumFractionDigits: 2
    }).replace('ABS', 'KES');
};

if (!databaseUrl)
throw new Error('must set DATABASE_URL environment var');

console.log('DATABASE_URL: ', databaseUrl);

pg.types.setTypeParser(20, function (val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});

// callback is called with (err, client, done)
function connect(callback) {
    return pg.connect(databaseUrl, callback);
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

exports.query = query;

pg.on('error', function (err) {
    console.log("erro")
    console.error('POSTGRES EMITTED AN ERROR', err);
});


// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

// callback takes (err, data)

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

//Returns a sessionId
exports.createUser = function (username, password, msisdn, promo_code, advert_add, ipAddress, userAgent, callback) {
    assert(username && password);
    console.log("user", advert_add)
    getClient(
        function (client, callback) {
            var hashedPassword = passwordHash.generate(password);
            
            // console.log("username", msisdn)
            
            client.query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username],
            function (err, data) {
                if (err) return callback(err);
                assert(data.rows.length === 1);
                if (data.rows[0].count > 0)
                return callback('USERNAME_TAKEN');
                
                client.query('SELECT COUNT(*) count FROM users WHERE msisdn = $1', [msisdn],
                function (err, data) {
                    if (err) return callback(err);
                    assert(data.rows.length === 1);
                    if (data.rows[0].count > 0)
                    return callback('PHONE_TAKEN');
                    
                    client.query('SELECT promo, id FROM promocode_generate LIMIT 1',
                    function (err, data) {
                        if (err) {
                            return callback(err);
                        }
                        var promo = data.rows[0].promo;
                        
                        client.query('DELETE FROM promocode_generate WHERE id = $1', [data.rows[0].id],
                        function (err, res) {
                            if (err) {
                                return callback(err);
                            }
                            client.query('SELECT id FROM users WHERE promo_code = $1', [promo_code],
                            function (err, data_ref) {
                                if (err) return callback(err);
                                client.query('UPDATE users SET total_referral_counts = total_referral_counts + 1 WHERE promo_code = $1', [promo_code],
                                function (err, data) {
                                    if (err) return callback(err);
                                    
                                    console.log("data rows", data_ref.rows)
                                    let user_id
                                    if (data_ref.rows.length > 0) {
                                        user_id = data_ref.rows[0].id
                                    } else {
                                        user_id = 0
                                    }
                                    client.query('INSERT INTO users(username, msisdn, password, promo_code,advert_promo, referred_by) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
                                    [username, msisdn, hashedPassword, promo, advert_add, user_id],
                                    function (err, data) {
                                        if (err) {
                                            if (err.code === '23505')
                                            return callback('USERNAME_TAKEN');
                                            else
                                            return callback(err);
                                        }
                                        
                                        assert(data.rows.length === 1);
                                        var user = data.rows[0];
                                        client.query('UPDATE marketing_basket SET amount = amount-$1',
                                        [config.BONUS],
                                        function (err, response) {
                                            if (err) return callback(err);
                                            client.query('SELECT amount FROM marketing_basket',
                                            function (err, response) {
                                                if (err) return callback(err);
                                                var balance = response.rows[0].amount
                                                client.query('INSERT INTO marketing_basket_log(amount, narrative, balance) VALUES($1,$2,$3)',
                                                [config.BONUS, `${config.BONUS} was deducted from marketing basket at the bonus for customer ${user.id}`, balance],
                                                function (err, response) {
                                                    if (err) return callback(err);
                                                    
                                                    client.query('INSERT INTO customer_logs(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                                                    [user.id, `${config.BONUS} was awarded to customer ${user.id} as the bonus`, config.BONUS, 0, 0, config.BONUS],
                                                    function (err, response) {
                                                        if (err) return callback(err);
                                                        client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1, bonuses = bonuses + $2 WHERE id = $3', [config.BONUS, config.BONUS, user.id],
                                                        function (err, res) {
                                                            if (err) return callback(err);
                                                            
                                                            if (data_ref.rows.length > 0) {
                                                                client.query('INSERT INTO referral(customerAccountId, referrerAccountId) VALUES($1, $2)',
                                                                [user.id, user_id],
                                                                function (err, data) {
                                                                    if (err) return callback(err);
                                                                    createSession(client, user.id, ipAddress, userAgent, false, callback);
                                                                })
                                                            } else {
                                                                createSession(client, user.id, ipAddress, userAgent, false, callback);
                                                            }
                                                            
                                                        })
                                                        
                                                    })
                                                })
                                            })
                                        })
                                    })
                                    
                                })
                                
                            })
                        })
                        
                    });
                })
            })
        }
        , callback);
    };
    
    /*
    exports.updateuserwallet = function (user_id, amount, callback) {
        console.log(user_id)
        console.log(amount)
        query('UPDATE users SET balance_satoshis = balance_satoshis + $1, referred_income = referred_income - $2  WHERE id = $3', [amount, amount, user_id],
        function (err, res) {
            if (err) return callback(err);
            // assert(res.rowCount === 1);
            console.log("res", res)
            
            query("SELECT balance_satoshis, referred_income, bonus FROM users WHERE id = $1", // update user wallet
            [user_id], function (err, response) {
                if (err) return callback(err);
                var mbalance = response.rows[0].balance_satoshis
                var referral = response.rows[0].referred_income
                var bonus = response.rows[0].bonus
                query('INSERT INTO customer_logs(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                [user_id, `${amount} referral amount was transferred to  the main wallet`, mbalance, referral, bonus, (mbalance + referral + bonus)],
                function (err, response) {
                    callback(null);
                    
                })
            });
        })
        
    };*/
    
    
    
    exports.updatepasswrod = function (msisdn, val, message, callback) {
        var hashedPassword = passwordHash.generate(val);
        query('UPDATE users SET password = $1, reset_status = $2 WHERE msisdn = $3', [hashedPassword, 1, msisdn], function (err, res) {
            if (err) return callback(err);
            assert(res.rowCount === 1);
            query('INSERT INTO message_logs(msisdn, message) VALUES($1,$2)', [msisdn, message], function (err, res) {
                if (err) return callback(err);
                callback(null);
            });
            
        });
        
    };
    
    
    
    
    exports.addLinkAdverts = function (name, reference, callback) {
        query('INSERT INTO advertiser(name, ad_reference) VALUES($1,$2)', [name, reference], function (err, res) {
            if (err) return callback(err);
            callback(null);
        });
    };
    
    
    exports.updatemsisdn = function (userId, msisdn, callback) {
        assert(userId);
        
        query('UPDATE users SET msisdn = $1 WHERE id = $2', [msisdn, userId], function (err, res) {
            if (err) return callback(err);
            
            assert(res.rowCount === 1);
            callback(null);
        });
        
    };
    
    exports.changeUserPassword = function (userId, password, callback) {
        assert(userId && password && callback);
        var hashedPassword = passwordHash.generate(password);
        query('UPDATE users SET password = $1, reset_status = $2 WHERE id = $3', [hashedPassword, 0, userId], function (err, res) {
            if (err) return callback(err);
            assert(res.rowCount === 1);
            callback(null);
        });
    };
    
    exports.updateMfa = function (userId, secret, callback) {
        assert(userId);
        query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, userId], callback);
    };
    
    // Possible errors:
    //   NO_USER, WRONG_PASSWORD, INVALID_OTP
    exports.validateUser = function (msisdn, password, callback) {
        assert(msisdn && password);
        
        query('SELECT id, password, reset_status FROM users WHERE msisdn = $1', [msisdn], function (err, data) {
            if (err) return callback(err);
            
            if (data.rows.length === 0)
            return callback('NO_USER');
            
            var user = data.rows[0];
            
            // console.log("user biodata ", user)
            
            var verified = passwordHash.verify(password, user.password);
            if (!verified)
            return callback('WRONG_PASSWORD');
            
            // if (user.mfa_secret) {
            //     if (!otp) return callback('INVALID_OTP'); // really, just needs one
            //     var expected = speakeasy.totp({ key: user.mfa_secret, encoding: 'base32' });
            //     if (otp !== expected)
            //         return callback('INVALID_OTP');
            // }
            
            callback(null, user.id, user.reset_status);
        });
    };
    
    /** Expire all the not expired sessions of an user by id **/
    exports.expireSessionsByUserId = function (userId, callback) {
        assert(userId);
        
        query('UPDATE sessions SET expired = now() WHERE user_id = $1 AND expired > now()', [userId], callback);
    };
    
    
    function createSession(client, userId, ipAddress, userAgent, remember, callback) {
        var sessionId = uuid.v4();
        
        var expired = new Date();
        if (remember)
        expired.setFullYear(expired.getFullYear() + 10);
        else
        expired.setDate(expired.getDate() + 21);
        
        client.query('INSERT INTO sessions(id, user_id, ip_address, user_agent, expired) VALUES($1, $2, $3, $4, $5) RETURNING id',
        [sessionId, userId, ipAddress, userAgent, expired], function (err, res) {
            if (err) return callback(err);
            assert(res.rows.length === 1);
            
            var session = res.rows[0];
            assert(session.id);
            
            callback(null, session.id, expired);
        });
    }
    
    exports.createOneTimeToken = function (userId, ipAddress, userAgent, callback) {
        assert(userId);
        var id = uuid.v4();
        
        query('INSERT INTO sessions(id, user_id, ip_address, user_agent, ott) VALUES($1, $2, $3, $4, true) RETURNING id', [id, userId, ipAddress, userAgent], function (err, result) {
            if (err) return callback(err);
            assert(result.rows.length === 1);
            
            var ott = result.rows[0];
            
            callback(null, ott.id);
        });
    };
    
    exports.createSession = function (userId, ipAddress, userAgent, remember, callback) {
        assert(userId && callback);
        
        getClient(function (client, callback) {
            createSession(client, userId, ipAddress, userAgent, remember, callback);
        }, callback);
        
    };
    
    exports.getUserFromUsername = function (username, callback) {
        assert(username && callback);
        
        query('SELECT * FROM users_view WHERE lower(username) = lower($1)', [username], function (err, data) {
            if (err) return callback(err);
            
            if (data.rows.length === 0)
            return callback('NO_USER');
            
            assert(data.rows.length === 1);
            var user = data.rows[0];
            assert(typeof user.balance_satoshis === 'number');
            
            callback(null, user);
        });
    };
    
    exports.getUsersFromEmail = function (msisdn, callback) {
        assert(msisdn, callback);
        
        query('select * from users where msisdn = $1', [msisdn], function (err, data) {
            if (err) return callback(err);
            
            if (data.rows.length === 0)
            return callback('NO_USERS');
            
            callback(null, data.rows);
            
        });
    };
    
    exports.addRecoverId = function (userId, ipAddress, callback) {
        assert(userId && ipAddress && callback);
        
        var recoveryId = uuid.v4();
        
        query('INSERT INTO recovery (id, user_id, ip)  values($1, $2, $3)', [recoveryId, userId, ipAddress], function (err, res) {
            if (err) return callback(err);
            callback(null, recoveryId);
        });
    };
    
    exports.getUserBySessionId = function (sessionId, callback) {
        assert(sessionId && callback);
        query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM sessions WHERE id = $1 AND ott = false AND expired > now())', [sessionId], function (err, response) {
            if (err) return callback(err);
            
            var data = response.rows;
            if (data.length === 0)
            return callback('NOT_VALID_SESSION');
            
            assert(data.length === 1);
            
            var user = data[0];
            assert(typeof user.balance_satoshis === 'number');
            
            callback(null, user);
        });
    };
    
    exports.getUserByValidRecoverId = function (recoverId, callback) {
        assert(recoverId && callback);
        query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM recovery WHERE id = $1 AND used = false AND expired > NOW())', [recoverId], function (err, res) {
            if (err) return callback(err);
            
            var data = res.rows;
            if (data.length === 0)
            return callback('NOT_VALID_RECOVER_ID');
            
            assert(data.length === 1);
            return callback(null, data[0]);
        });
    };
    
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
    
    /* Sets the recovery record to userd and update password */
    exports.changePasswordFromRecoverId = function (recoverId, password, callback) {
        assert(recoverId && password && callback);
        var hashedPassword = passwordHash.generate(password);
        
        var sql = m(function () {/*
        WITH t as (UPDATE recovery SET used = true, expired = now()
        WHERE id = $1 AND used = false AND expired > now()
        RETURNING *) UPDATE users SET password = $2 where id = (SELECT user_id FROM t) RETURNING *
    */});
    
    query(sql, [recoverId, hashedPassword], function (err, res) {
        if (err)
        return callback(err);
        
        var data = res.rows;
        if (data.length === 0)
        return callback('NOT_VALID_RECOVER_ID');
        
        assert(data.length === 1);
        
        callback(null, data[0]);
    }
    );
};

exports.getGame = function (gameId, callback) {
    assert(gameId && callback);
    
    query('SELECT * FROM games ' +
    'LEFT JOIN game_hashes ON games.id = game_hashes.game_id ' +
    'WHERE games.id = $1 AND games.ended = TRUE', [gameId], function (err, result) {
        if (err) return callback(err);
        if (result.rows.length == 0) return callback('GAME_DOES_NOT_EXISTS');
        assert(result.rows.length == 1);
        callback(null, result.rows[0]);
    });
};

exports.getGamesPlays = function (gameId, callback) {
    query('SELECT u.username, p.bet, p.cash_out, p.bonus FROM plays p, users u ' +
    ' WHERE game_id = $1 AND p.user_id = u.id ORDER by p.cash_out/p.bet::float DESC NULLS LAST, p.bet DESC', [gameId],
    function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows);
    }
    );
};

function addSatoshis(client, userId, amount, callback) {
    // console.log("come here for small", amount, userId)
    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1, total_deposit = total_deposit + $2 WHERE id = $3', [amount, amount, userId], function (err, res) {
        if (err) return callback(err);
        // console.log("name", res)
        assert(res.rowCount === 1);
        callback(null);
    });
}



function insertIntSuspend(client, userId, amount, transaction_id, callback) {
    
    client.query('INSERT INTO suspend_account(transaction_id, amount, user_id) VALUES($1,$2,$3)', [transaction_id, amount, userId], function (err, res) {
        if (err) return callback(err);
        console.log("name", res.rowCount)
        callback(null);
    });
}



// DEPOSITS

function updateExciseDuty(client, amount, userId, callback) {
    client.query('UPDATE excise_duty SET tax_amount = tax_amount + $1;', [amount], function (err, res) {
        if (err) return callback(err);
        
        console.log("here", amount, userId,)
        client.query('SELECT tax_amount FROM excise_duty', function (err, res) {  // select current balance
            if (err) return callback(err);
            var balance = res.rows[0].tax_amount
            client.query('INSERT INTO excise_duty_log(tax_amount, user_id, balance) VALUES($1, $2, $3)',
            [amount, userId, balance],
            function (err, response) {
                if (err) return callback(err);
                callback(null);
            }
            );
        });
    });
}




function updateCustomerLogs(client, id, account_no, name, amount, transaction_id, msisdn, callback) {
    client.query('INSERT INTO c2b_confirmation_logs(account_no, amount, name, transaction_id, msisdn) VALUES($1, $2, $3, $4, $5)',
    [account_no,  amount, name, transaction_id, msisdn],
    function (err, response) {
        if (err) return callback(err);
        client.query('DELETE FROM c2b_confirmation WHERE id = $1;', [id], function (err, res) {
            if (err) return callback(err);
            console.log("here", amount, userId,)
            callback(null);
        }
        );
        
    });
}


function updateWithholding(client, userId, amount, callback) {
    client.query('UPDATE withholding SET tax_amount = tax_amount + $1;', [amount], function (err, res) {
        if (err) return callback(err);
        client.query('SELECT tax_amount FROM withholding', function (err, res) {  // select current balance
            if (err) return callback(err);
            var balance = res.rows[0].tax_amount
            client.query('INSERT INTO withholding_log(tax_amount, user_id, balance) VALUES($1, $2, $3)',
            [amount, userId, balance],
            function (err, response) {
                if (err) return callback(err);
                callback(null);
            }
            );
            
            
        });
    });
}



exports.getGameLogs = function (callback) {  // update bet logs
    getClient(function (client, callback) {
        client.query('select * from games order by id desc limit 6',
        function (err, response) {
            if (err) return callback(err);
            
            callback(null, response.rows)
        })
    }, callback);
};


exports.addIncomingSMS = function (userId, message, msisdn, callback) {
    var sql = 'INSERT INTO incoming_sms (user_id, narrative, msisdn) values($1, $2, $3)';
    query(sql, [userId, message, msisdn], function (err, res) {
        if (err)
        return callback(err);
        
        assert(res.rowCount === 1);
        
        callback(null);
    });
};

function addQueueSMS (origin, destination, message, callback) {
    var sql = 'INSERT INTO sms_queue(originator, destination, message) values($1, $2, $3)';
    query(sql, [origin, destination, message], function (err, res) {
        if (err)
        return callback(err);
        
        assert(res.rowCount === 1);
        
        callback(null);
    });
};



// sms queue
exports.addQueueSMS = function (origin, destination, message, callback) {
    var sql = 'INSERT INTO sms_queue(originator, destination, message) values($1, $2, $3)';
    query(sql, [origin, destination, message], function (err, res) {
        if (err)
        return callback(err);
        
        assert(res.rowCount === 1);
        
        callback(null);
    });
};



exports.addQueueSTK = function (reference, msisdn, amount, account_no, message, callback) {
    var sql = 'INSERT INTO stk_queue(reference, msisdn, amount, account_no, narrative) values($1, $2, $3, $4, $5)';
    query(sql, [reference, msisdn, amount, account_no, message], function (err, res) {
        if (err)
        return callback(err);
        
        assert(res.rowCount === 1);
        
        callback(null);
    });
};


function addOutgoingSMS(userId, message, callback) {
    var sql = 'INSERT INTO outgoing_sms (user_id, narrative ) values($1, $2)';
    query(sql, [userId, message], function (err, res) {
        if (err)
        return callback(err);
        
        // console.log("here")
        assert(res.rowCount === 1);
        callback(null);
    });
};

exports.addOutgoingSMS = function (userId, message, callback) {
    var sql = 'INSERT INTO outgoing_sms (user_id, narrative ) values($1, $2)';
    query(sql, [userId, message], function (err, res) {
        if (err)
        return callback(err);
        
        // console.log("here")
        assert(res.rowCount === 1);
        callback(null);
    });
};


function makeDeposit(client, userId, amount, msisdn, transaction_id, description, channel, callback) {
    
    // console.log(userId)
    client.query("SELECT balance_satoshis, msisdn, referred_income, bonus FROM users WHERE msisdn = $1", // update user wallet
    [msisdn], function (err, response) {
        if (err) return callback(err);
        var mbalance = response.rows[0].balance_satoshis
        var referral = response.rows[0].referred_income
        var msisdn = response.rows[0].msisdn
        var bonus = response.rows[0].bonus
        
        var message = util.format(config.SMS_DEPOSIT, formatDecimals(amount), formatDecimals(mbalance))
        addQueueSMS(config.SENDER_ID, msisdn, message, function (err, user) {
            if (err) return callback(err);
            addOutgoingSMS(userId, message, function (err, user) {
                if (err) return callback(err);
                client.query('INSERT INTO fundings(balance, status,bitcoin_deposit_txid,check_process, user_id, amount, description, channel) VALUES($1,$2,$3,$4, $5, $6, $7, $8)',
                [mbalance, 'success', transaction_id, 1, userId, amount, description, channel],
                function (err, response) {
                    if (err) return callback(err);
                    
                    
                    console.log("pin deposit here", mbalance, 'success', transaction_id, 1)
                    client.query('INSERT INTO customer_trx_logs(user_id, trx_id, narrative, dr, cr, balance_before, balance_after, bonus) \
                    VALUES($1, $2, $3, $4, $5, $6, $7, $8)',
                    [userId, transaction_id, `Deposit`, 0, amount, (mbalance - mamount), mbalance, bonus],
                    function (err, response) {
                        if (err) return callback(err);
                        callback(null);
                        
                        /* uncomment to give bonusses
                        client.query('SELECT id, DATE(created) as created, DATE(NOW()) as current, referreraccountid, customeraccountid, status,to_unlock FROM referral where customeraccountid = $1',  // check referral if exists
                        [userId],
                        function (err, response) {
                            if (err) return callback(err);
                            if (response.rows.length > 0) {
                                var mstatus = response.rows[0].status
                                var mtounlock = response.rows[0].to_unlock
                                var beneficiary = response.rows[0].referreraccountid
                                var referral_id = response.rows[0].id
                                var date_last = response.rows[0].created
                                
                                let date_1 = new Date(date_last);
                                let date_2 = new Date();
                                let difference = date_2.getTime() - date_1.getTime();
                                let TotalDays = Math.ceil(difference / (1000 * 3600 * 24));
                                
                                var date_days = TotalDays;
                                
                                console.log("days difference", date_days)
                                
                                client.query("SELECT balance_satoshis, referred_income, bonus FROM users WHERE id = $1", // update user wallet
                                [beneficiary], function (err, response) {
                                    var mbalance_referral = response.rows[0].balance_satoshis
                                    var referral_referral = response.rows[0].referred_income
                                    var bonus_referral = response.rows[0].bonus
                                    
                                    if (mstatus === 1) {  // retention commission is calculated
                                        
                                        var retention_fee = amount * config.RETENTION_FEE
                                        
                                        client.query('UPDATE retention_basket SET amount = amount-$1',
                                        [retention_fee],
                                        function (err, response) {
                                            if (err) return callback(err);
                                            client.query('SELECT amount FROM retention_basket',
                                            function (err, response) {
                                                if (err) return callback(err);
                                                var balance = response.rows[0].amount
                                                console.log("SUBMIT HERE ", balance)
                                                client.query('INSERT INTO retention_basket_log(amount, narrative, balance) VALUES($1,$2,$3)',
                                                [retention_fee, `${retention_fee} was deducted from retention basket pay retention fee for customer ${beneficiary}`, balance],
                                                function (err, response) {
                                                    if (err) return callback(err);
                                                    client.query('INSERT INTO customer_logs(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                                                    [beneficiary, `${retention_fee} retention fee was awarded to customer ${beneficiary}.`, mbalance_referral, referral_referral + retention_fee, bonus_referral, referral_referral + retention_fee + mbalance_referral + bonus_referral],
                                                    function (err, response) {
                                                        if (err) return callback(err);
                                                        
                                                        client.query('UPDATE users SET referred_income =referred_income + $1, total_referral_income = total_referral_income + $2 WHERE id = $3', [retention_fee, retention_fee, beneficiary],
                                                        function (err, res) {
                                                            if (err) return callback(err);
                                                            callback(null);
                                                        })
                                                    })
                                                })
                                            })
                                        })
                                    } else {
                                        if ((mtounlock + amount) >= config.COMMISSION) {  // if amount deposit is greater than commission
                                            
                                            console.log("HERE", config.COMMISSION)
                                            var commission_fee = config.COMMISSION
                                            
                                            client.query('UPDATE marketing_basket SET amount = amount-$1',
                                            [commission_fee],
                                            function (err, response) {
                                                if (err) return callback(err);
                                                client.query('SELECT amount FROM marketing_basket',
                                                function (err, response) {
                                                    if (err) return callback(err);
                                                    var balance = response.rows[0].amount
                                                    client.query('INSERT INTO marketing_basket_log(amount, narrative, balance) VALUES($1,$2,$3)',
                                                    [commission_fee, `${commission_fee} was deducted from marketing basket to pay commission for customer ${beneficiary}`, balance],
                                                    function (err, response) {
                                                        if (err) return callback(err);
                                                        
                                                        client.query('INSERT INTO customer_logs(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                                                        [beneficiary, `${commission_fee} commission fee was awarded to customer ${beneficiary}.`, mbalance_referral, referral_referral + commission_fee, bonus_referral, referral_referral + commission_fee + mbalance_referral + bonus_referral],
                                                        function (err, response) {
                                                            if (err) return callback(err);
                                                            client.query('UPDATE users SET referred_income =referred_income + $1, total_referral_income = total_referral_income + $2 WHERE id = $3', [commission_fee, commission_fee, beneficiary],
                                                            function (err, res) {
                                                                if (err) return callback(err);
                                                                client.query('UPDATE referral  SET status = $1, to_unlock = to_unlock + $2 WHERE id = $3', [1, amount, referral_id],  // update referral statusp
                                                                function (err, res) {
                                                                    if (err) return callback(err);
                                                                    callback(null);
                                                                })
                                                            })
                                                        })
                                                    })
                                                })
                                            })
                                            
                                        } else {
                                            client.query('UPDATE referral SET to_unlock = to_unlock + $1 WHERE id = $2', [amount, referral_id],  // update referral statusp
                                            function (err, res) {
                                                if (err) return callback(err);
                                                callback(null);
                                            })
                                        }
                                    }
                                })
                            } else {
                                callback(null);
                            }
                            
                            */
                            
                        });
                    }
                    )
                }
                );
            })
        })
        
    }
    
    
    exports.updatefailedWithdrawal = function updatefailedWithdrawal(reference, withdrawl_charges, description, callback) {
        query('SELECT user_id, amount, balance FROM fundings WHERE withdrawal_id = $1', [reference], function (err, result) {
            if (err) return callback(err);
            var userId = result.rows[0].user_id;
            var amount = result.rows[0].amount * -1
            query("UPDATE users SET balance_satoshis = balance_satoshis + $1, total_withdrawal = total_withdrawal - $2 WHERE id = $3", // update user wallet
            [amount + withdrawl_charges, amount + withdrawl_charges, userId], function (err, response) {
                if (err) return callback(err);
                if (response.rowCount !== 1)
                return callback(new Error('Unexpected withdrawal row count: \n' + response));
                // var balance = result.rows[0].balance - amount
                query('UPDATE fundings SET status = $1, description = $2, balance= balance + $3, check_process = $4 where global_withdrawal_id = $5',
                ['failed', description, amount, 1, reference],
                function (err, response) {
                    if (err) return callback(err);
                    // var fundingId = response.rows[0].id;
                    // assert(typeof fundingId === 'number');
                    callback(null);
                }
                );
            })
        })
    }
    
    
    
    exports.getUserPlays = function (userId, limit, offset, callback) {
        assert(userId);
        
        query('SELECT p.bet, p.bonus, p.cash_out, p.created, p.game_id, g.game_crash FROM plays p ' +
        'LEFT JOIN (SELECT * FROM games) g ON g.id = p.game_id ' +
        'WHERE p.user_id = $1 AND g.ended = true ORDER BY p.id DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset], function (err, result) {
            if (err) return callback(err);
            callback(null, result.rows);
        }
        );
    };
    
    exports.getGiveAwaysAmount = function (userId, callback) {
        assert(userId);
        query('SELECT SUM(g.amount) FROM giveaways g where user_id = $1', [userId], function (err, result) {
            if (err) return callback(err);
            return callback(null, result.rows[0]);
        });
    };
    
    
    
    exports.addGiveaway = function (userId, amount, reference, callback) {
        assert(userId && callback);
        getClient(function (client, callback) {
            client.query('INSERT INTO giveaways(user_id, amount, reference) VALUES($1, $2, $3) ', [userId, amount, reference], function (err) {
                if (err) return callback(err);
                callback(null);
            });
        }, callback);
    };
    
    exports.addDeposit = function (callback) {
        // assert(userId && callback);
        getClient(function (client, callback) {
            
            
            client.query('SELECT * FROM c2b_confirmation order by id desc limit 1', function (err, result) {
                
                if (result.rows.length > 0) {
                    
                    console.log(msisdn)

                    var msisdn = result.rows[0].msisdn
                    
                    var channel = 'Mpesa'
                    
                    var transaction_id = result.rows[0].transaction_id
                    
                    var customer_id = result.rows[0].id
                    
                    var account_no = result.rows[0].account_no
                    
                    var description = 'success'
                    
                    var name = result.rows[0].name
                    
                    var amount = result.rows[0].amount
                    
                    var amount_new = amount;
                    
                    client.query('SELECT COUNT(*) count FROM users WHERE msisdn::text = $1', [msisdn], function (err, result) {
                        if (err) return callback(err);
                        if (result.rows[0].count > 0) {
                            // assert(result.rows.length === 1);



                            client.query('SELECT id FROM users WHERE msisdn::text = $1', [msisdn], function (err, result) {
                                
                                tax_amount = amount_new * (config.EXCISE_DUTY / (1 + config.EXCISE_DUTY))
                                
                                // amount = amount_new - tax_amount;
                                
                                var userId = result.rows[0].id
                                addSatoshis(client, userId, amount, function (err) {
                                    if (err) return callback(err);
                                    makeDeposit(client, userId, amount, msisdn, transaction_id, description, channel, function (err) {
                                        if (err) return callback(err);
                                        updateCustomerLogs(client,customer_id, account_no, name , transaction_id, msisdn, function (err) {   // exciste duty
     
                                            if (tax_amount > 0) {
                                                updateExciseDuty(client, tax_amount, userId, function (err) {   // exciste duty
                                                    if (err) return callback(err);
                                                    callback(null);
                                                })
                                            }
                                            callback(null);
                                        });
                                    })
                                })
                            });
                        } else {
                            
                            
                            
                            insertIntSuspend(client, userId, amount_new, transaction_id, function (err) {
                                if (err) return callback(err);
                                callback(null);
                            });
                        }
                    
                        
                    })
                }
                })

            }, callback);
        };
        
        
        
        
        
        
        exports.addRawGiveaway = function (userNames, amount, tax_amount, callback) {
            assert(userNames && amount && callback);
            
            getClient(function (client, callback) {
                
                var tasks = userNames.map(function (username) {
                    return function (callback) {
                        
                        client.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username], function (err, result) {
                            if (err) return callback('unable to add bits');
                            
                            if (result.rows.length === 0) return callback(username + ' didnt exists');
                            
                            var userId = result.rows[0].id;
                            client.query('INSERT INTO giveaways(user_id, amount) VALUES($1, $2) ', [userId, amount], function (err, result) {
                                if (err) return callback(err);
                                
                                assert(result.rowCount == 1);
                                addSatoshis(client, userId, amount, function (err) {
                                    if (err) return callback(err);
                                    callback(null);
                                });
                            });
                        });
                    };
                });
                
                async.series(tasks, function (err, ret) {
                    if (err) return callback(err);
                    return callback(null, ret);
                });
                
            }, callback);
        };
        
        
        exports.getUserNetProfit = function (userId, callback) {
            assert(userId);
            query('SELECT (' +
            'COALESCE(SUM(cash_out), 0) + ' +
            'COALESCE(SUM(bonus), 0) - ' +
            'COALESCE(SUM(bet), 0)) profit ' +
            'FROM plays ' +
            'WHERE user_id = $1', [userId], function (err, result) {
                if (err) return callback(err);
                assert(result.rows.length == 1);
                return callback(null, result.rows[0]);
            }
            );
        };
        
        exports.getUserNetProfitLast = function (userId, last, callback) {
            assert(userId);
            query('SELECT (' +
            'COALESCE(SUM(cash_out), 0) + ' +
            'COALESCE(SUM(bonus), 0) - ' +
            'COALESCE(SUM(bet), 0))::bigint profit ' +
            'FROM ( ' +
            'SELECT * FROM plays ' +
            'WHERE user_id = $1 ' +
            'ORDER BY id DESC ' +
            'LIMIT $2 ' +
            ') restricted ', [userId, last], function (err, result) {
                if (err) return callback(err);
                assert(result.rows.length == 1);
                return callback(null, result.rows[0].profit);
            }
            );
        };
        
        exports.getPublicStats = function (username, callback) {
            
            var sql = 'SELECT id AS user_id, username, gross_profit, net_profit, games_played, ' +
            'COALESCE((SELECT rank FROM leaderboard WHERE user_id = id), -1) rank ' +
            'FROM users WHERE lower(username) = lower($1)';
            
            query(sql,
                [username], function (err, result) {
                    if (err) return callback(err);
                    
                    if (result.rows.length !== 1)
                    return callback('USER_DOES_NOT_EXIST');
                    
                    return callback(null, result.rows[0]);
                }
                );
            };
            
            
            
            exports.requestWithdrawal = function (userId, amount, withdrawl_charges, withdrawalAddress, withdrawalId, mpesa_charges, callback) {
                assert(typeof userId === 'number');
                assert(typeof amount === 'number');
                
                
                // assert(typeof withdrawalAddress === 'string');
                // assert(satoshis > 200000);]
                
                // assert(lib.isUUIDv4(withdrawalId));
                
                connect(function (err, client, done) {
                    const shouldAbort = err => {
                        console.error('Error in transaction', err.stack)
                        client.query('ROLLBACK', err => {
                            if (err) {
                                console.error('Error rolling back client', err.stack)
                            }
                            // release the client back to the pool
                            callback(null)
                        })
                    }
                    client.query('BEGIN', err => {
                        if (err) return shouldAbort(err);
                        
                        client.query("UPDATE users SET balance_satoshis = balance_satoshis - $1,  total_withdrawal = total_withdrawal + $2 WHERE id = $3", // update user wallet
                        [(amount + mpesa_charges), (amount + mpesa_charges), userId], function (err, response) {
                            if (err) return callback(err);
                            //
                            
                            client.query("SELECT balance_satoshis, msisdn FROM users WHERE id = $1", // update user wallet
                            [userId], function (err, response) {
                                if (err) return callback(err);
                                var balance = response.rows[0].balance_satoshis
                                client.query('INSERT INTO customer_trx_logs(user_id, trx_id, narrative, dr, cr, balance_before, balance_after, bonus) \
                                VALUES($1, $2, $3, $4, $5, $6, $7, $8)',
                                [userId, ``, `Withdraw`, (amount + mpesa_charges), 0, (balance + amount + mpesa_charges),
                                balance, 0],
                                function (err, response) {
                                    
                                    if (err) return callback(err);
                                    
                                    client.query('INSERT INTO fundings(user_id, amount, bitcoin_withdrawal_address,  balance, description,global_withdrawal_id, status, check_process) ' +   //record withdraw requests
                                    "VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                                    [userId, -1 * (amount + mpesa_charges), withdrawalAddress, balance, 'Withdrawal', withdrawalId, "success", 1],
                                    function (err, response) {
                                        if (err) return callback(err);
                                        
                                        
                                        client.query("SELECT balance_satoshis,referred_income,bonus FROM users WHERE id = $1", // update user wallet
                                        [userId], function (err, response) {
                                            if (err) return callback(err);
                                            var balance = response.rows[0].balance_satoshis
                                            var mbalance = response.rows[0].balance_satoshis
                                            var referral = response.rows[0].referred_income
                                            var msisdn = response.rows[0].msisdn
                                            var bonus = response.rows[0].bonus
                                            
                                            client.query('INSERT INTO mpesa_disburse(msisdn, amount) ' +   //record withdraw requests
                                            "VALUES($1, $2)",
                                            [msisdn, amount],
                                            function (err, response) {
                                                if (err) return callback(err);
                                                
                                                var message = util.format(config.SMS_WITHDRAW, formatDecimals(amount), formatDecimals(balance))
                                                
                                                addQueueSMS(msisdn, config.SENDER_ID, message, function (error, response, body) {
                                                    addOutgoingSMS(userId, messa, function (err, user) {
                                                        callback(null, "");
                                                    })
                                                })
                                            })
                                        })
                                        
                                    })
                                })
                            })
                        })
                    })
                }, callback);
            };
            
            
            
            /*
            exports.makeWithdrawal = function (reference, transaction_id, callback) {
                getClient(function (client, callback) {
                    console.log("here", reference, transaction_id)
                    // SELECT * FROM fundings WHERE user_id = $1
                    client.query('SELECT user_id, amount from fundings WHERE withdrawal_id = $1',
                    [reference],
                    function (err, response) {
                        if (err) return callback(err);
                        var user_id = response.rows[0].user_id
                        
                        var amount = response.rows[0].amount * -1
                        
                        client.query('UPDATE fundings SET status = $1 , check_process = $1 where global_withdrawal_id = $2',
                        ['success', reference],
                        function (err, response) {
                            if (err) return callback(err);
                            client.query('SELECT * from users where id = $1',
                            [user_id],
                            function (err, response) {
                                if (err) return callback(err);
                                var mbalance = response.rows[0].balance_satoshis
                                var referral = response.rows[0].referred_income
                                var bonus = response.rows[0].bonus
                                
                                client.query('INSERT INTO customer_logs(user_id, narrative, wallet_balance, referral_income, bonus, actual_balance) VALUES($1,$2,$3,$4,$5,$6)',
                                [user_id, `${amount} was withdrawed. Reference ID ${reference}`, mbalance, referral, bonus, (mbalance + referral + bonus)],
                                function (err, response) {
                                    if (err) return callback(err);
                                    callback(null);
                                })
                            })
                        })
                    })
                }, callback);
            };
            */
            
            exports.getWithdrawals = function (userId, callback) {
                assert(userId && callback);
                
                query("SELECT * FROM fundings WHERE user_id = $1 AND amount < 0 ORDER BY created DESC", [userId], function (err, result) {
                    if (err) return callback(err);
                    
                    var data = result.rows.map(function (row) {
                        return {
                            amount: Math.abs(row.amount),
                            destination: row.bitcoin_withdrawal_address,
                            status: row.status,
                            description: row.description,
                            created: row.created
                        };
                    });
                    callback(null, data);
                });
            };
            
            
            exports.verify_user = function (msisdn, betAmount, callback) {
                
                query("SELECT * FROM users WHERE msisdn = $1;", [msisdn], function (err, result) {
                    if (err) return callback(err);
                    
                    if (result.rows.length > 0) {
                        
                        var data = result.rows.map(function (row) {
                            return {
                                id: row.id,
                                username: row.username,
                                balance: row.balance_satoshis - betAmount,
                                mbalance: row.balance_satoshis,
                                msisdn: row.msisdn,
                                playing: row.playing,
                                name: row.name
                            };
                        });
                        callback(null, data[0]);
                    } else {
                        callback(null, 0)
                    }
                });
            };
            
            
            
            exports.getReferrals = function (userId, callback) {
                assert(userId && callback);
                
                query("SELECT * FROM users WHERE id = $1", [userId], function (err, result) {
                    if (err) return callback(err);
                    var data = result.rows[0]
                    console.log(data)
                    callback(null, data);
                });
            };
            
            exports.getDeposits = function (userId, callback) {
                assert(userId && callback);
                
                query("SELECT * FROM fundings WHERE user_id = $1 AND amount > 0 ORDER BY created DESC", [userId], function (err, result) {
                    if (err) return callback(err);
                    
                    var data = result.rows.map(function (row) {
                        return {
                            amount: row.amount,
                            txid: row.bitcoin_deposit_txid,
                            created: row.created
                        };
                    });
                    callback(null, data);
                });
            };
            
            exports.getDepositsAmount = function (userId, callback) {
                assert(userId);
                query('SELECT SUM(f.amount) FROM fundings f WHERE user_id = $1 AND amount >= 0', [userId], function (err, result) {
                    if (err) return callback(err);
                    callback(null, result.rows[0]);
                });
            };
            
            exports.getWithdrawalsAmount = function (userId, callback) {
                assert(userId);
                query('SELECT SUM(f.amount) FROM fundings f WHERE user_id = $1 AND amount < 0', [userId], function (err, result) {
                    if (err) return callback(err);
                    
                    callback(null, result.rows[0]);
                });
            };
            
            exports.setFundingsWithdrawalTxid = function (fundingId, txid, callback) {
                // assert(typeof fundingId === 'number');
                // assert(typeof txid === 'string');
                // assert(callback);
                query(`SELECT count(*) FROM fundings WHERE bitcoin_withdrawal_txid <> '' AND withdrawal_id = $1`, [txid],
                function (err, data) {
                    if (err) return callback(err);
                    assert(data.rows.length === 1);
                    if (data.rows[0].count > 0)
                    return callback('Transaction already verified');
                    
                    query('UPDATE fundings SET bitcoin_withdrawal_txid = $1 WHERE withdrawal_id = $2', [fundingId, txid],
                    function (err, result) {
                        if (err) return callback(err);
                        // assert(result.rowCount === 1);
                        callback(null);
                    }
                    );
                    
                }
                );
                
            };
            
            
            exports.getLeaderBoard = function (byDb, order, callback) {
                var sql = 'SELECT * FROM leaderboard ORDER BY ' + byDb + ' ' + order + ' LIMIT 100';
                query(sql, function (err, data) {
                    if (err)
                    return callback(err);
                    callback(null, data.rows);
                });
            };
            
            exports.addChatMessage = function (userId, created, message, channelName, isBot, callback) {
                var sql = 'INSERT INTO chat_messages (user_id, created, message, channel, is_bot) values($1, $2, $3, $4, $5)';
                query(sql, [userId, created, message, channelName, isBot], function (err, res) {
                    if (err)
                    return callback(err);
                    
                    assert(res.rowCount === 1);
                    
                    callback(null);
                });
            };
            
            exports.getChatTable = function (limit, channelName, callback) {
                assert(typeof limit === 'number');
                var sql = "SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot " +
                "FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel = $1 ORDER BY chat_messages.id DESC LIMIT $2";
                query(sql, [channelName, limit], function (err, data) {
                    if (err)
                    return callback(err);
                    callback(null, data.rows);
                });
            };
            
            //Get the history of the chat of all channels except the mods channel
            exports.getAllChatTable = function (limit, callback) {
                assert(typeof limit === 'number');
                var sql = m(function () {/*
                SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot, chat_messages.channel AS "channelName"
                FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel <> 'moderators'  ORDER BY chat_messages.id DESC LIMIT $1
            */});
            query(sql, [limit], function (err, data) {
                if (err)
                return callback(err);
                callback(null, data.rows);
            });
        };
        
        exports.getSiteStats = function (callback) {
            
            function as(name, callback) {
                return function (err, results) {
                    if (err)
                    return callback(err);
                    
                    assert(results.rows.length === 1);
                    callback(null, [name, results.rows[0]]);
                }
            }
            
            var tasks = [
                function (callback) {
                    query('SELECT COUNT(*) FROM users', as('users', callback));
                },
                function (callback) {
                    query('SELECT COUNT(*) FROM games', as('games', callback));
                },
                function (callback) {
                    query('SELECT COALESCE(SUM(fundings.amount), 0)::bigint sum FROM fundings WHERE amount < 0', as('withdrawals', callback));
                },
                function (callback) {
                    query("SELECT COUNT(*) FROM games WHERE ended = false AND created < NOW() - interval '5 minutes'", as('unterminated_games', callback));
                },
                function (callback) {
                    query('SELECT COUNT(*) FROM fundings WHERE amount < 0 AND bitcoin_withdrawal_txid IS NULL', as('pending_withdrawals', callback));
                },
                function (callback) {
                    query('SELECT COALESCE(SUM(fundings.amount), 0)::bigint sum FROM fundings WHERE amount > 0', as('deposits', callback));
                },
                function (callback) {
                    query('SELECT ' +
                    'COUNT(*) count, ' +
                    'SUM(plays.bet)::bigint total_bet, ' +
                    'SUM(plays.cash_out)::bigint cashed_out, ' +
                    'SUM(plays.bonus)::bigint bonused ' +
                    'FROM plays', as('plays', callback));
                }
            ];
            
            async.series(tasks, function (err, results) {
                if (err) return callback(err);
                
                var data = {};
                
                results.forEach(function (entry) {
                    data[entry[0]] = entry[1];
                });
                
                callback(null, data);
            });
            
        };