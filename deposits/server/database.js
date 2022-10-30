var assert = require('assert');
var config = require('../config/config');
var pg = require('pg');
var passwordHash = require('password-hash');
var util = require('util');


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


function createUser(username, password, msisdn, promo_code, advert_add, ipAddress, userAgent, callback) {
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
                                                    
                                                    client.query('INSERT INTO customer_trx_logs(user_id, trx_id, narrative, dr, cr, balance_before, balance_after, bonus) \
                                                    VALUES($1, $2, $3, $4, $5, $6, $7, $8)',
                                                    [user.id, '', `Bonus`, 0, config.BONUS, 0, config.BONUS, 0],
                                                    
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
    
    
    function addSatoshis(client, userId, amount, callback) {
        // console.log("come here for small", amount, userId)
        client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1, total_deposit = total_deposit + $2 WHERE id = $3', [amount, amount, userId], function (err, res) {
            if (err) return callback(err);
            // console.log("name", res)
            assert(res.rowCount === 1);
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
        
        console.log("hekf kfkf here", id, account_no, name, amount, transaction_id, msisdn)
        client.query('INSERT INTO c2b_confirmation_logs(account_no, amount, name, transaction_id, msisdn) VALUES($1, $2, $3, $4, $5)',
        [account_no,  amount, name, transaction_id, msisdn], function (err, response) {
            if (err) {
                console.log("insert",  err)
                
                return callback(err);
                
            }
            client.query('DELETE FROM c2b_confirmation WHERE id = $1;', [id], function (err, res) {
                if (err) return callback(err);
                // console.log("here", amount, userId,)
                callback(null);
            } );
            
        });
    }
    
    
    function addQueueSMS (origin, destination, message, callback) {
        var sql = 'INSERT INTO sms_queue(originator, destination, message) values($1, $2, $3)';
        query(sql, [origin, destination, message], function (err, res) {
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
                        [userId, transaction_id, `Deposit`, 0, amount, (mbalance - amount), mbalance, bonus],
                        function (err, response) {
                            if (err) return callback(err);
                            console.log("pin deposit here", mbalance, 'success', transaction_id, 1)
                            callback(null);
                                
                            });
                        }
                        )
                    }
                    );
                })
            })
            
        }
        
    
        exports.addDeposit = async function(callback) {
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
                                            updateCustomerLogs(client,customer_id, account_no, name , amount, transaction_id, msisdn, function (err) {   // exciste duty
                                                
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
                            } 
                            
                            else {
                                
                                // var ipAddress = req.ip;
                                // var userAgent = req.get('user-agent');
                                
                                var val = ('' + Math.random()).substring(2, 9)
                                
                                let message = `${val} is your new pin.`
                                addQueueSMS(config.SENDER_ID, msisdn, message, function (err, user) {
                                    
                                    createUser(msisdn, val, `${msisdn.replace(/^0+/, '')}`, '', '', '197.248.4.162', 'd', function (err, sessionId) {
                                        if (err) return callback(err);
                                        callback(null);
                                    });
                                })   
                            }
                        }) 
                        
                        
                        
                    }
                    
                })
                
            }, callback);
        };
        
        
        
        