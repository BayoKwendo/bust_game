
var assert = require('better-assert');
var async = require('async');
var bitcoinjs = require('bitcoinjs-lib');
var request = require('request');
var timeago = require('timeago');
var lib = require('./lib');
var database = require('./database');
var withdraw = require('./withdraw');
var sendEmail = require('./sendEmail');
var speakeasy = require('speakeasy');
var qr = require('qr-image');
var util = require('util');
var uuid = require('uuid');
const { SMS_URL, GAME_BASEURL, INSERT_URL } = require('../config/config');

var _ = require('lodash');
var config = require('../config/config');
// var  = require('https://js.paystack.co/v2/inline.js')


var sessionOptions = {
    httpOnly: true,
    secure: config.PRODUCTION
};

/**
* POST
* Public API
* Register a user
*/

function stringGen(len) {
    var text = " ";
    var charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++)
    text += charset.charAt(Math.floor(Math.random() * charset.length));
    return text;
}




function formatDecimals(amount) {
    return (parseFloat(amount)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        // style:"currency",
        currency: 'KES',
        maximumFractionDigits: 2
    }).replace('ABS', 'KES');
};


// function formatDecimals(amount) {
//     return new Intl.NumberFormat('en-US', {
//         style: 'currency',
//         currency: "KES",
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2
//     }).format(parseFloat(amount)).replace("ABS", "");
// };

// check sms bet amount validity
function validateBetAmount(user, amount, msisdn, balance) {
    if (amount >= parseFloat(config.MINIMUM_STACK)) {
        if (amount < parseFloat(config.MAXIMUM_STAKE)) {
            return true;
        } else {
            
            database.getGameLogs(function (err, resp) {
                if (err) {
                    console.log('Error inserting to bet log', err);
                }
                // if bet amount is greater than maximum stake
                
                var messa = `Sorry,\nYou have staked a bet amount higher than the maximum amount of Ksh 3,000.00. Please stake a lower amount and play again.\n-\nWallet Balance: ${formatDecimals(balance)}\n\nLast 5 Bustpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\n\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\n or Visit https://luckybust.co.ke/ to PLAY & WIN upto 100X your amount.\n\nHelpDesk: ${config.HOTLINE}`
                request.post({
                    headers: { 'content-type': 'application/json', 'Authorization': '' },
                    url: SMS_URL,
                    json: {
                        "msisdn": `${msisdn}`,
                        "message": messa,
                    }
                }, function (error, response, body) {
                    console.log(body)
                    console.error(error)
                    
                    database.addOutgoingSMS(user.id, messa, function (err, user) {
                    })
                })
                return false;
            })
        }
    } else {
        // if amount is less than minimum stack, response send sms to user
        database.getGameLogs(function (err, resp) {
            if (err) {
                console.log('Error inserting to bet log', err);
            }
            
            var messa = `Sorry,\nYou have staked a bet amount lower than the minimum amount of Ksh 10. Please stake a higher amount and play again.\n-\nWallet Balance: ${formatDecimals(balance)}\n-\n\nLast 5 Bustpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
            request.post({
                headers: { 'content-type': 'application/json', 'Authorization': '' },
                url: SMS_URL,
                json: {
                    "msisdn": `${msisdn}`,
                    "message": messa,
                }
            }, function (error, response, body) {
                console.log(body)
                console.error(error)
                
                database.addOutgoingSMS(user.id, messa, function (err, user) {
                })
                
            })
            return false;
        })
    }
}


// validate cashout value

function validateCashOut(user, value, msisdn, amount, balance) {
    
    if (value > config.MINIMUM_CASHOUT) {
        return true  // is valid cashout value
    } else {
        database.getGameLogs(function (err, resp) {
            if (err) {
                console.log('Error inserting to bet log', err);
            }
            var messa = `Sorry,\nYou have selected an invalid BUSTOUT Point. We accept points between 1x and 100x. Please choose a new Bustout Point and play again.\n-\nWallet Balance: ${formatDecimals(balance + amount)}\n\nLast 5 Bustpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
            request.post({
                headers: { 'content-type': 'application/json', 'Authorization': '' },
                url: SMS_URL,
                json: {
                    "msisdn": `${msisdn}`,
                    "message": messa,
                }
            }, function (error, response, body) {
                database.addOutgoingSMS(user.id, messa, function (err, user) {
                })
            })
            return false // is not valid cashout value
        })
    }
}



// sms play here, fucntion to verify user existance by msisdn
exports.smsPlay = function (req, res, next) {
    
    
    var values = _.merge(req.body, { user: {} });
    var str = values.message  // message here
    
    
    
    
    var kashOutString = str.substring(  // extract LUCKYBUST 
    str.indexOf("#") + 1 || str.indexOf("*") + 1 || str.indexOf("X") + 1 || str.indexOf("x") + 1,  // if string matched is * or #
    str.length
    )
    
    
    // var mdepostString = str.substring(  // extract bet amount here
    //     0,
    //     2
    // );
    
    // // console.log("deposit", mdepostString)
    // // console.log(str.replace(" ", '').toUpperCase())
    
    // var mTwoKeyword = mdepostString.replace(" ", '').toUpperCase();
    
    // if (mTwoKeyword == 'BD') {
    
    //     console.log("here  ", mTwoKeyword)
    //     var mdeposit = string.replace(/[^0-9]/g, '')
    
    
    // } else if (mTwoKeyword == 'BW') {
    
    //     var mwithdraw = string.replace(/[^0-9]/g, '')
    
    //     // console.log("here  ", mTwoKeyword)
    
    // } else if (mTwoKeyword == 'BL') {
    
    //     var mbalance = string.replace(/[^0-9]/g, '')
    
    // } else {
    
    //     // console.log("here  ", mTwoKeyword)
    
    // }
    
    
    
    
    // if(mdeposit  == ''){
    
    // }
    
    
    
    
    
    
    var betString = str.substring(  // extract bet amount here
    0,
    str.lastIndexOf("*")
    );
    
    if (!betString) {  // bet string contain # value as separator
        betString = str.substring(  // extract bet amount here
        0,
        str.lastIndexOf("#")
        );
    }
    if (!betString) {
        betString = str.substring(  // extract bet amount here
        0,
        str.lastIndexOf("X")
        );
    }
    
    if (!betString) {
        betString = str.substring(  // extract bet amount here
        0,
        str.lastIndexOf("x")
        );
    }
    
    var mbet = betString.replace(/[^0-9]/g, '');
    var mkashOut = kashOutString.replace(/[^\d\.]/g, '');
    
    
    values.betAmount = mbet;
    values.autoCashOut = mkashOut;
    
    
    betAmount = parseFloat(values.betAmount)  // bet amount staked
    
    
    
    database.verify_user(req.body.msisdn, betAmount, function (err, user) {
        if (err) res.status(500).json({
            status_code: 500,
            status: 'failed', message: 'Customer does not exits'
            
        });
        // console.log("kashout value ", user)
        if (user == 0) {
            /// add new USER here ,,,
            var username = lib.removeNullsAndTrim(values.msisdn);
            var password = lib.removeNullsAndTrim(values.msisdn);
            // var password2 = lib.removeNullsAndTrim(values.msisdn);
            var msisdn = lib.removeNullsAndTrim(values.msisdn);
            var ipAddress = req.ip;
            var userAgent = req.get('user-agent');
            
            // var msisdn = msisdn
            var notValid = lib.isInvalidUsername(username);
            if (notValid) {
                res.status(200).json({
                    status_code: 200,
                    status: true,
                    message: 'username not valid because: ' + notValid
                });
            }
            // stop new registrations of >16 char usernames
            if (username.length > 16) {
                res.status(200).json({
                    status_code: 200,
                    status: true,
                    message: 'Username is too long'
                });
            }
            notValid = lib.isInvalidPassword(password);
            if (notValid) {
                values.user.password = null;
                values.user.confirm = null;
                res.status(200).json({
                    status_code: 200,
                    status: true,
                    message: 'password not valid because: ' + notValid
                });
            }
            if (msisdn) {
                notValid = lib.isInvalidPhone(msisdn);
                if (notValid) {
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: 'phone not valid'
                    });
                }
            }
            
            // Ensure password and confirmation match
            database.createUser(username, password, `${msisdn.replace(/^0+/, '')}`, "", "", ipAddress, userAgent, function (err, sessionId) {
                
                if (err) {
                    if (err === 'USERNAME_TAKEN') {
                        values.user.name = null;
                        res.status(200).json({
                            status_code: 200,
                            status: true,
                            message: 'Username already taken'
                        });
                    }
                    if (err === 'PHONE_TAKEN') {
                        values.user.name = null;
                        res.status(200).json({
                            status_code: 200,
                            status: true,
                            message: 'Phone number already registired'
                        });
                    }
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: 'Unable to register user: \n' + err
                    });
                } else {
                    
                    database.verify_user(req.body.msisdn, betAmount, function (err, user) {
                        if (err) res.status(500).json({
                            status_code: 500,
                            status: 'failed', message: 'Customer does not exits'
                            
                        });
                        
                        
                        
                        // send registration message
                        var messa = `Bet on LUCKYBUST now and win up to 100 x Bet amount!\n\nA simple game that grows your BET AMOUNT, EVERY SECOND, from the 1x, up to 100x.\n\nThe game suddenly crashes at any point between 1x and 100x.\n\nTo win, cash out by setting your LUCKYBUST point to be lower than the game crash out point.\n\nPlay NOW at luckybust.co.ke\n\nor\n\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\n\nHelpdesk:  ${config.HOTLINE}`
                        request.post({
                            headers: { 'content-type': 'application/json', 'Authorization': '' },
                            url: SMS_URL,
                            json: {
                                "msisdn": `${values.msisdn}`,
                                "message": messa,
                            }
                        })
                        database.addIncomingSMS(user.id, req.body.message, req.body.msisdn, function (err, user) {
                        })
                        
                        database.addOutgoingSMS(user.id, messa, function (err, user) {
                        })
                        
                        
                        
                        // user exist in our systems
                        betAmount = parseFloat(values.betAmount)  // bet amount staked
                        autoCashOut = parseFloat(values.autoCashOut)  // cashout amount staked
                        
                        var balance = config.BONUS - betAmount;
                        
                        if (validateBetAmount(user, betAmount, values.msisdn, config.BONUS)) {
                            if (validateCashOut(user, autoCashOut, values.msisdn, betAmount, balance)) {
                                
                                console.log("bet balancfffe", balance)
                                if ((balance + betAmount) >= betAmount) {  //  check if staked amount is greater than user balance 
                                    // if bet amount is valid, place bet here now
                                    // call placeBet function
                                    
                                    request.post({
                                        headers: { 'content-type': 'application/json', 'Authorization': '' },
                                        url: GAME_BASEURL,
                                        json: {
                                            "betAmount": betAmount,
                                            "autoCashOut": autoCashOut,
                                            "userID": user.id,
                                            "msisdn": values.msisdn,
                                            "playing": user.playing,
                                            "user": user
                                        }
                                    }, function (error, response, body) {
                                        console.log(body)
                                        console.error(error)
                                        res.status(200).json({
                                            status_code: 200,
                                            status: true,
                                            user: user,
                                            betAmount: betAmount,
                                            autoCashOut: autoCashOut
                                        });
                                    })
                                } else {
                                    
                                    // insufficient balance
                                    request.post({
                                        headers: { 'content-type': 'multipart/form-data' },
                                        url: 'https://oauth.mobiapps.tk/oauth/token',
                                        formData: {
                                            grant_type: 'password',
                                            username: 'zikwachu_ke',
                                            password: 'x7&WA-4KsUJmt2_5',
                                            client_id: 'T4VqAoaAozZOqh12mbEFIfUEFzxAy3OqPQPr8r1X'
                                            
                                        }
                                    }, function (error, response, body) {
                                        console.log(error)
                                        let result = JSON.parse(body)
                                        if (result) {
                                            console.log(result)
                                            
                                            var ref = stringGen(10).replace(" ", "");
                                            
                                            request.post({
                                                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + result.access_token },
                                                url: 'http://172.16.0.102:2002/m-pesa/zikwachu/express',
                                                json: {
                                                    "msisdn": req.body.msisdn.toString(),
                                                    "amount": betAmount,
                                                    "account": user.id,
                                                    "client": "zikwachu",
                                                    "reference": ref,
                                                    "callback": "http://172.16.0.103:3852/deposit"
                                                }
                                            }, function (error, response, body) {
                                                console.log(body)
                                                
                                                
                                                var messa = `STK Push has been initiated successfully!\nYour wallet Balance is ${formatDecimals(config.BONUS)}\n-\nPlease top up to play in the next round.\n\nSMS B<Amount>#<Bustpoint> to 29304\nEg B50#2 to 29304\n\nHelpdesk:  ${config.HOTLINE}`
                                                request.post({
                                                    headers: { 'content-type': 'application/json', 'Authorization': '' },
                                                    url: SMS_URL,
                                                    json: {
                                                        "msisdn": `${values.msisdn}`,
                                                        "message": messa,
                                                    }
                                                })
                                                database.addIncomingSMS(user.id, req.body.message, req.body.msisdn, function (err, user) {
                                                })
                                                
                                                res.status(200).json({
                                                    status_code: 200,
                                                    status: true,
                                                    message: "STK SEND",
                                                    user: user
                                                })
                                                
                                            })
                                            
                                            
                                        }
                                    })
                                }
                                
                            } else {
                                res.status(200).json({
                                    status_code: 200,
                                    status: true,
                                    message: "Invalid CashOut value",
                                    user: user
                                })
                            }
                        } else {
                            res.status(200).json({
                                status_code: 200,
                                status: true,
                                message: "Invalid Bet Amount",
                                user: user
                            });
                        }
                        // res.status(200).json({
                        //     status_code: 200,
                        //     status: 'registred',
                        // });
                    })
                }
                
                
            });
        } else {
            
            
            var mdepostString = str.substring(  // extract bet amount here
            0,
            2
            );
            
            
            var mdeposttHREEString = str.substring(  // extract bet amount here
            0,
            3
            );
            
            var mdepostStringFirst = str.substring(  // extract bet amount here
            0,
            1
            );
            
            // console.log("deposit", mdepostString)
            // console.log(str.replace(" ", '').toUpperCase())
            
            var mTwoKeyword = mdepostString.replace(" ", '').toUpperCase();
            var mThreeWord = mdeposttHREEString.replace(" ", '').toUpperCase();
            
            var mTwoKeywordTwo = mdepostStringFirst.replace(" ", '').toUpperCase();
            
            if (mTwoKeyword == 'BD' || mTwoKeyword == 'D#' || mTwoKeyword == 'D*' || mTwoKeywordTwo == 'D') {
                console.log(" deposit here here  ", mTwoKeyword)
                var mdeposit = str.replace(/[^0-9]/g, '')
                
                if (mdeposit && mdeposit > 0) {
                    
                    request.post({
                        headers: { 'content-type': 'multipart/form-data' },
                        url: 'https://oauth.mobiapps.tk/oauth/token',
                        formData: {
                            grant_type: 'password',
                            username: 'zikwachu_ke',
                            password: 'x7&WA-4KsUJmt2_5',
                            client_id: 'T4VqAoaAozZOqh12mbEFIfUEFzxAy3OqPQPr8r1X'
                            
                        }
                    }, function (error, response, body) {
                        console.log(error)
                        let result = JSON.parse(body)
                        if (result) {
                            console.log(result)
                            
                            var ref = stringGen(10).replace(" ", "");
                            
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + result.access_token },
                                url: 'http://172.16.0.102:2002/m-pesa/zikwachu/express',
                                json: {
                                    "msisdn": req.body.msisdn.toString(),
                                    "amount": mdeposit,
                                    "account": user.id,
                                    "client": "zikwachu",
                                    "reference": ref,
                                    "callback": "http://172.16.0.103:3852/deposit"
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                
                                var messa = `You have insufficient balance to place a bet.\nYour wallet Balance is ${formatDecimals(user.mbalance)}\n-\nPlease top up to play in the next round.\n\nSMS B<Amount>#<Bustpoint> to 29304\nEg B50*2 to 29304\n\nHelpdesk:  ${config.HOTLINE}`
                                request.post({
                                    headers: { 'content-type': 'application/json', 'Authorization': '' },
                                    url: SMS_URL,
                                    json: {
                                        "msisdn": `${values.msisdn}`,
                                        "message": messa,
                                    }
                                })
                                
                                database.addIncomingSMS(user.id, req.body.message, req.body.msisdn, function (err, user) {
                                })
                                
                                
                                res.status(200).json({
                                    status_code: 200,
                                    status: true,
                                    message: "STK SEND",
                                    user: user
                                })
                                
                            })
                            
                            
                        }
                    })
                    
                } else {
                    database.getGameLogs(function (err, resp) {
                        if (err) {
                            console.log('Error inserting to bet log', err);
                        }
                        
                        var messa = `Invalid entry!! \n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\nHelpDesk: ${config.HOTLINE}`
                        request.post({
                            headers: { 'content-type': 'application/json', 'Authorization': '' },
                            url: SMS_URL,
                            json: {
                                "msisdn": `${values.msisdn}`,
                                "message": messa,
                            }
                        }, function (error, response, body) {
                            console.log(body)
                            console.error(error)
                        })
                        database.addOutgoingSMS(user.id, messa, function (err, user) {
                        })
                    })
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: 'sUCCESS'
                    });
                }
            }
            else if (mTwoKeyword == 'BW' || mTwoKeyword == 'W#' || mTwoKeyword == 'W*' || mTwoKeywordTwo == 'W') {
                
                var mwithdraw = str.replace(/[^0-9]/g, '')
                
                if (mwithdraw && mwithdraw > 0) {
                    
                    var withdrawal_id = stringGen(10).replace(" ", "");
                    
                    handleWithdrawRequest(user, mwithdraw, values.msisdn, withdrawal_id)
                    
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: 'sUCCESS'
                    });
                    
                    
                } else {
                    database.getGameLogs(function (err, resp) {
                        if (err) {
                            console.log('Error inserting to bet log', err);
                        }
                        
                        var messa = `Invalid entry!! \n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
                        request.post({
                            headers: { 'content-type': 'application/json', 'Authorization': '' },
                            url: SMS_URL,
                            json: {
                                "msisdn": `${values.msisdn}`,
                                "message": messa,
                            }
                        }, function (error, response, body) {
                            console.log(body)
                            console.error(error)
                        })
                        database.addOutgoingSMS(user.id, messa, function (err, user) {
                        })
                    })
                    
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: 'sUCCESS'
                    });
                    
                    
                }
                
                console.log("withdraw request  ", mwithdraw)
                
            } else if (mTwoKeyword == 'BL' || mThreeWord == 'BAL') {
                // var mbalance = str.replace(/[^0-9]/g, '')
                database.getGameLogs(function (err, resp) {
                    if (err) {
                        console.log('Error inserting to bet log', err);
                    }
                    
                    var messa = `Your wallet ballance is ${formatDecimals(user.mbalance)} \n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\nHelpDesk: ${config.HOTLINE}`
                    request.post({
                        headers: { 'content-type': 'application/json', 'Authorization': '' },
                        url: SMS_URL,
                        json: {
                            "msisdn": `${values.msisdn}`,
                            "message": messa,
                        }
                    }, function (error, response, body) {
                        console.log(body)
                        console.error(error)
                    })
                    database.addOutgoingSMS(user.id, messa, function (err, user) {
                    })
                })
                
                res.status(200).json({
                    status_code: 200,
                    status: true,
                    message: 'sUCCESS'
                });
                
                
                console.log("check balance comes here")
                
                
            } else {
                
                
                // user exist in our systems
                betAmount = parseFloat(values.betAmount)  // bet amount staked
                autoCashOut = parseFloat(values.autoCashOut)  // cashout amount staked
                
                database.addIncomingSMS(user.id, req.body.message, req.body.msisdn, function (err, user) {
                })
                
                if (validateBetAmount(user, betAmount, values.msisdn, user.mbalance)) {
                    if (validateCashOut(user, autoCashOut, values.msisdn, betAmount, user.balance)) {
                        
                        console.log("here", betAmount)
                        if ((user.balance + betAmount) >= betAmount) {  //  check if staked amount is greater than user balance 
                            // if bet amount is valid, place bet here now
                            // call placeBet function
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': '' },
                                url: GAME_BASEURL,
                                json: {
                                    "betAmount": betAmount,
                                    "autoCashOut": autoCashOut,
                                    "userID": user.id,
                                    "msisdn": values.msisdn,
                                    "playing": user.playing,
                                    "user": user
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                console.error(error)
                                res.status(200).json({
                                    status_code: 200,
                                    status: true,
                                    user: user,
                                    betAmount: betAmount,
                                    autoCashOut: autoCashOut
                                });
                            })
                        } else {
                            
                            // insufficient balance.
                            
                            // insufficient balance
                            request.post({
                                headers: { 'content-type': 'multipart/form-data' },
                                url: 'https://oauth.mobiapps.tk/oauth/token',
                                formData: {
                                    grant_type: 'password',
                                    username: 'zikwachu_ke',
                                    password: 'x7&WA-4KsUJmt2_5',
                                    client_id: 'T4VqAoaAozZOqh12mbEFIfUEFzxAy3OqPQPr8r1X'
                                    
                                }
                            }, function (error, response, body) {
                                console.log(error)
                                let result = JSON.parse(body)
                                if (result) {
                                    console.log(result)
                                    
                                    var ref = stringGen(10).replace(" ", "");
                                    
                                    request.post({
                                        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + result.access_token },
                                        url: 'http://172.16.0.102:2002/m-pesa/zikwachu/express',
                                        json: {
                                            "msisdn": req.body.msisdn.toString(),
                                            "amount": betAmount,
                                            "account": user.id,
                                            "client": "zikwachu",
                                            "reference": ref,
                                            "callback": "http://172.16.0.103:3852/deposit"
                                        }
                                    }, function (error, response, body) {
                                        console.log(body)
                                        
                                        var messa = `You have insufficient balance to place a bet.\nYour wallet Balance is ${formatDecimals(user.balance + betAmount)}\n-\nPlease top up to play in the next round.\n\nSMS B<Amount>#<Bustpoint> to 29304\nEg B50*2 to 29304\n\nHelpdesk:  ${config.HOTLINE}`
                                        request.post({
                                            headers: { 'content-type': 'application/json', 'Authorization': '' },
                                            url: SMS_URL,
                                            json: {
                                                "msisdn": `${values.msisdn}`,
                                                "message": messa,
                                            }
                                        })
                                        
                                        database.addIncomingSMS(user.id, req.body.message, req.body.msisdn, function (err, user) {
                                        })
                                        
                                        
                                        res.status(200).json({
                                            status_code: 200,
                                            status: true,
                                            message: "STK SEND",
                                            user: user
                                        })
                                        
                                    })
                                    
                                    
                                }
                            })
                        }
                        
                    } else {
                        res.status(200).json({
                            status_code: 200,
                            status: true,
                            message: "Invalid CashOut value",
                            user: user
                        })
                    }
                } else {
                    res.status(200).json({
                        status_code: 200,
                        status: true,
                        message: "Invalid Bet Amount",
                        user: user
                    });
                }
            }
        }
    });
};

exports.register = function (req, res, next) {
    
    var values = _.merge(req.body, { user: {} });
    var recaptcha = lib.removeNullsAndTrim(req.body['g-recaptcha-response']);
    var username = lib.removeNullsAndTrim(values.user.name);
    var password = lib.removeNullsAndTrim(values.user.password);
    var password2 = lib.removeNullsAndTrim(values.user.confirm);
    var msisdn = lib.removeNullsAndTrim(values.user.msisdn);
    
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');
    
    var notValid = lib.isInvalidUsername(username);
    if (notValid) return res.render('register', { warning: 'username not valid because: ' + notValid, values: values.user });
    
    // stop new registrations of >16 char usernames
    if (username.length > 16)
    return res.render('register', { warning: 'Username is too long', values: values.user });
    
    notValid = lib.isInvalidPassword(password);
    if (notValid) {
        values.user.password = null;
        values.user.confirm = null;
        return res.render('register', { warning: 'password not valid because: ' + notValid, values: values.user });
    }
    
    // if (email) {
    //     notValid = lib.isInvalidEmail(email);
    //     if (notValid) return res.render('register', { warning: 'email not valid because: ' + notValid, values: values.user });
    // }
    if (msisdn) {
        notValid = lib.isInvalidPhone(msisdn);
        if (notValid) return res.render('register', { warning: 'phone not valid', values: values.user });
    }
    
    // Ensure password and confirmation match
    if (password !== password2) {
        return res.render('register', {
            warning: 'password and confirmation did not match'
        });
    }
    database.createUser(username, password, `${254}${msisdn.replace(/^0+/, '')}`, req.body.promo_code, req.body.advert_add, ipAddress, userAgent, function (err, sessionId) {
        
        console.log("def", req.body.advert_add)
        
        if (err) {
            if (err === 'USERNAME_TAKEN') {
                values.user.name = null;
                return res.render('register', { warning: 'User name taken...', values: values.user });
            }
            if (err === 'PHONE_TAKEN') {
                values.user.name = null;
                return res.render('register', { warning: 'Phone number already registired', values: values.user });
            }
            console.log("user here", err)
            return next(new Error('Unable to register user: \n' + err));
        }
        res.cookie('id', sessionId, sessionOptions);
        return res.redirect('/');
    });
};

/**
* POST
* Public API
* Login a user
*/
exports.login = function (req, res, next) {
    var msisd = lib.removeNullsAndTrim(req.body.msisdn);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var remember = !!req.body.remember;
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');
    
    if (!msisd || !password)
    return res.render('login', { warning: 'no phone or password' });
    
    var msisdn = `${254}${msisd.replace(/^0+/, '')}`
    
    database.validateUser(msisdn, password, function (err, userId, resetPassword) {
        if (err) {
            console.log('[Login] Error for ', msisdn, ' err: ', err);
            
            if (err === 'NO_USER')
            return res.render('login', { warning: 'Phone number does not exist' });
            if (err === 'WRONG_PASSWORD')
            return res.render('login', { warning: 'Invalid password' });
            if (err === 'INVALID_OTP') {
                var warning = otp ? 'Invalid one-time password' : undefined;
                return res.render('login-mfa', { msisdn: msisdn, password: password, warning: warning });
            }
            return next(new Error('Unable to validate user ' + msisdn + ': \n' + err));
        }
        assert(userId);
        
        database.createSession(userId, ipAddress, userAgent, remember, function (err, sessionId, expires) {
            if (err)
            return next(new Error('Unable to create session for userid ' + userId + ':\n' + err));
            
            if (remember)
            sessionOptions.expires = expires;
            
            res.cookie('id', sessionId, sessionOptions);
            
            
            console.log("bre", resetPassword)
            if (resetPassword == 0) {
                res.redirect('/');
            } else {
                res.redirect('/security');
            }
        });
    });
};

/**
* POST
* Logged API
* Logout the current user
*/
exports.logout = function (req, res, next) {
    var sessionId = req.cookies.id;
    var userId = req.user.id;
    
    assert(sessionId && userId);
    
    database.expireSessionsByUserId(userId, function (err) {
        if (err)
        return next(new Error('Unable to logout got error: \n' + err));
        res.redirect('/');
    });
};

/**
* GET
* Logged API
* Shows the graph of the user profit and games
*/
exports.profile = function (req, res, next) {
    
    var user = req.user; //If logged here is the user info
    var username = lib.removeNullsAndTrim(req.params.name);
    
    var page = null;
    if (req.query.p) { //The page requested or last
        page = parseInt(req.query.p);
        if (!Number.isFinite(page) || page < 0)
        return next('Invalid page');
    }
    
    if (!username)
    return next('No username in profile');
    
    database.getPublicStats(username, function (err, stats) {
        if (err) {
            if (err === 'USER_DOES_NOT_EXIST')
            return next('User does not exist');
            else
            return next(new Error('Cant get public stats: \n' + err));
        }
        
        /**
        * Pagination
        * If the page number is undefined it shows the last page
        * If the page number is given it shows that page
        * It starts counting from zero
        */
        
        var resultsPerPage = 50;
        var pages = Math.floor(stats.games_played / resultsPerPage);
        
        if (page && page >= pages)
        return next('User does not have page ', page);
        
        // first page absorbs all overflow
        var firstPageResultCount = stats.games_played - ((pages - 1) * resultsPerPage);
        
        var showing = page ? resultsPerPage : firstPageResultCount;
        var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;
        
        if (offset > 3000) {
            return next('Sorry we can\'t show games that far back :( ');
        }
        
        
        var tasks = [
            function (callback) {
                database.getUserNetProfitLast(stats.user_id, showing + offset, callback);
            },
            function (callback) {
                database.getUserPlays(stats.user_id, showing, offset, callback);
            }
        ];
        
        
        async.parallel(tasks, function (err, results) {
            if (err) return next(new Error('Error getting user profit: \n' + err));
            
            var lastProfit = results[0];
            
            var netProfitOffset = stats.net_profit - lastProfit;
            var plays = results[1];
            
            
            if (!lib.isInt(netProfitOffset))
            return next(new Error('Internal profit calc error: ' + username + ' does not have an integer net profit offset'));
            
            assert(plays);
            
            plays.forEach(function (play) {
                play.timeago = timeago(play.created);
            });
            
            var previousPage;
            if (pages > 1) {
                if (page && page >= 2)
                previousPage = '?p=' + (page - 1);
                else if (!page)
                previousPage = '?p=' + (pages - 1);
            }
            
            var nextPage;
            if (pages > 1) {
                if (page && page < (pages - 1))
                nextPage = '?p=' + (page + 1);
                else if (page && page == pages - 1)
                nextPage = stats.username;
            }
            
            res.render('user', {
                user: user,
                stats: stats,
                plays: plays,
                net_profit_offset: netProfitOffset,
                showing_last: !!page,
                previous_page: previousPage,
                next_page: nextPage,
                games_from: stats.games_played - (offset + showing - 1),
                games_to: stats.games_played - offset,
                pages: {
                    current: page == 0 ? 1 : page + 1,
                    total: Math.ceil(stats.games_played / 100)
                }
            });
        });
        
    });
};

/**
* GET
* Shows the request bits page
* Restricted API to logged users
**/
exports.request = function (req, res) {
    var user = req.user; //Login var
    assert(user);
    
    res.render('request', { user: user });
};

/**
* POST
* Process the give away requests
* Restricted API to logged users
**/




exports.depositRequest = function (req, res, next) {
    var user = req.user;
    
    var ref = stringGen(10).replace(" ", "");
    
    let message = 'deposit request success'
    
    database.addQueueSTK(ref, user.msisdn, req.body.amount, user.id, message, function (err, user) {
        console.log('error ', err)
        return res.redirect('/');
        
    })
    
    
    // return res.render('deposits', { user: user, success: 'Deposit requested initiated successful! check your phone' });
    
    
    
};


exports.confirmDeposit = function (req, res, next) {
    if (req.body.status == 'success') {
        
        console.log("account no", req.body)
        database.addDeposit(parseInt(req.body.account), req.body.transaction_id, parseFloat(req.body.amount), req.body.description, 'mpesa', function (err) {
            if (err) res.status(500).json({ success: false, message: 'Sorry, ' + err });
            res.status(200).json({ success: true, message: 'Success!' });
        });
    }
};


// exports.giveawayRequest = function (req, res, next) {
//     // var user = req.user;
//     // console.log()
//     // assert(user);
//     database.addGiveaway(req.body.account_no, req.body.amount, req.body.reference,  function (err) {
//         if (err) {
//             if (err.message === 'NOT_ELIGIBLE') {
//                 return res.render('request', { user: user, warning: 'You have to wait ' + err.time + ' minutes for your next give away.' });
//             } else if (err === 'USER_DOES_NOT_EXIST') {
//                 return res.render('error', { error: 'User does not exist.' });
//             }

//             return next(new Error('Unable to add giveaway: \n' + err));
//         }
//         user.balance_satoshis += user.amount;

//         return res.redirect('/play?m=received');
//     });

// };


/**
* GET
* Restricted API
* Shows the account page, the default account page.
**/
exports.account = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    var tasks = [
        function (callback) {
            database.getDepositsAmount(user.id, callback);
        },
        function (callback) {
            database.getWithdrawalsAmount(user.id, callback);
        },
        function (callback) {
            database.getGiveAwaysAmount(user.id, callback);
        },
        function (callback) {
            database.getUserNetProfit(user.id, callback)
        }
    ];
    
    async.parallel(tasks, function (err, ret) {
        if (err)
        return next(new Error('Unable to get account info: \n' + err));
        
        var deposits = ret[0];
        var withdrawals = ret[1];
        var giveaways = ret[2];
        var net = ret[3];
        user.deposits = !deposits.sum ? 0 : deposits.sum;
        user.withdrawals = !withdrawals.sum ? 0 : withdrawals.sum;
        user.giveaways = !giveaways.sum ? 0 : giveaways.sum;
        user.net_profit = net.profit;
        user.deposit_address = lib.deriveAddress(user.id);
        
        res.render('account', { user: user });
    });
};

/**
* POST
* Restricted API
* Change the user's password
**/
exports.resetPassword = function (req, res, next) {
    var user = req.user;
    assert(user);
    var password = lib.removeNullsAndTrim(req.body.old_password);
    var newPassword = lib.removeNullsAndTrim(req.body.password);
    // var otp = lib.removeNullsAndTrim(req.body.otp);
    var confirm = lib.removeNullsAndTrim(req.body.confirmation);
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');
    
    if (!password) return res.render('/security?err=Enter%20your%20old%20password', { error: "enter password" });
    
    var notValid = lib.isInvalidPassword(newPassword);
    if (notValid) return res.render('security' + notValid, { error: "Not valid password" });
    if (newPassword !== confirm) return res.render('security', { error: "Password Dont Match" });
    
    database.validateUser(user.msisdn, password, function (err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.render('security', { error: "Wrong password" });
            // if (err === 'INVALID_OTP') return res.redirect('/security?err=invalid one-time password.');
            //Should be an user here
            return next(new Error('Unable to reset password: \n' + err));
        }
        assert(userId === user.id);
        database.changeUserPassword(user.id, newPassword, function (err) {
            if (err)
            return next(new Error('Unable to change user password: \n' + err));
            
            database.expireSessionsByUserId(user.id, function (err) {
                if (err)
                return next(new Error('Unable to delete user sessions for userId: ' + user.id + ': \n' + err));
                
                database.createSession(user.id, ipAddress, userAgent, false, function (err, sessionId) {
                    if (err)
                    return next(new Error('Unable to create session for userid ' + userId + ':\n' + err));
                    
                    res.cookie('id', sessionId, sessionOptions);
                    res.redirect('/play');
                });
            });
        });
    });
};

/**
* POST
* Restricted API
* Adds an email to the account
**/
exports.editEmail = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    var email = lib.removeNullsAndTrim(req.body.email);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    
    //If no email set to null
    if (email.length === 0) {
        email = null;
    } else {
        var notValid = lib.isInvalidEmail(email);
        if (notValid) return res.redirect('/security?err=email invalid because: ' + notValid);
    }
    
    notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('/security?err=password not valid because: ' + notValid);
    
    database.validateUser(user.msisdn, password, function (err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.redirect('/security?err=wrong%20password');
            if (err === 'INVALID_OTP') return res.redirect('/security?err=invalid%20one-time%20password');
            //Should be an user here
            return next(new Error('Unable to validate user adding email: \n' + err));
        }
        
        database.updateEmail(userId, email, function (err) {
            if (err)
            return next(new Error('Unable to update email: \n' + err));
            
            res.redirect('security?m=Email added');
        });
    });
};

/**
* GET
* Restricted API
* Shows the security page of the users account
**/
exports.security = function (req, res) {
    var user = req.user;
    assert(user);
    
    if (!user.mfa_secret) {
        user.mfa_potential_secret = speakeasy.generate_key({ length: 32 }).base32;
        var qrUri = 'otpauth://totp/bustabit:' + user.username + '?secret=' + user.mfa_potential_secret + '&issuer=bustabit';
        user.qr_svg = qr.imageSync(qrUri, { type: 'svg' });
        user.sig = lib.sign(user.username + '|' + user.mfa_potential_secret);
    }
    
    res.render('security', { user: user });
};

/**
* POST
* Restricted API
* Enables the two factor authentication
**/
exports.enableMfa = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var sig = lib.removeNullsAndTrim(req.body.sig);
    var secret = lib.removeNullsAndTrim(req.body.mfa_potential_secret);
    
    if (user.mfa_secret) return res.redirect('/security?err=2FA%20is%20already%20enabled');
    if (!otp) return next('Missing otp in enabling mfa');
    if (!sig) return next('Missing sig in enabling mfa');
    if (!secret) return next('Missing secret in enabling mfa');
    
    if (!lib.validateSignature(user.username + '|' + secret, sig))
    return next('Could not validate sig');
    
    var expected = speakeasy.totp({ key: secret, encoding: 'base32' });
    
    if (otp !== expected) {
        user.mfa_potential_secret = secret;
        var qrUri = 'otpauth://totp/bustabit:' + user.username + '?secret=' + secret + '&issuer=bustabit';
        user.qr_svg = qr.imageSync(qrUri, { type: 'svg' });
        user.sig = sig;
        
        return res.render('security', { user: user, warning: 'Invalid 2FA token' });
    }
    
    database.updateMfa(user.id, secret, function (err) {
        if (err) return next(new Error('Unable to update 2FA status: \n' + err));
        res.redirect('/security?=m=Two-Factor%20Authentication%20Enabled');
    });
};

/**
* POST
* Restricted API
* Disables the two factor authentication
**/
exports.disableMfa = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    var secret = lib.removeNullsAndTrim(user.mfa_secret);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    
    if (!secret) return res.redirect('/security?err=Did%20not%20sent%20mfa%20secret');
    if (!user.mfa_secret) return res.redirect('/security?err=2FA%20is%20not%20enabled');
    if (!otp) return res.redirect('/security?err=No%20OTP');
    
    var expected = speakeasy.totp({ key: secret, encoding: 'base32' });
    
    if (otp !== expected)
    return res.redirect('/security?err=invalid%20one-time%20password');
    
    database.updateMfa(user.id, null, function (err) {
        if (err) return next(new Error('Error updating Mfa: \n' + err));
        
        res.redirect('/security?=m=Two-Factor%20Authentication%20Disabled');
    });
};

/**
* POST
* Public API
* Send password recovery to an user if possible
**/
exports.sendPasswordRecover = function (req, res, next) {
    var msisdn = lib.removeNullsAndTrim(req.body.msisdn);
    if (!msisdn) return res.redirect('forgot-password');
    msisdn = `${254}${msisdn.replace(/^0+/, '')}`
    //We don't want to leak if the email has users, so we send this message even if there are no users from that email
    var messageSent = { success: 'Password reset is successfully. check your phone' };
    
    database.getUsersFromEmail(msisdn, function (err, users) {
        if (err) {
            if (err === 'NO_USERS')
            return res.render('forgot-password', { warning: 'Phone number does not exist' });
            else
            return next(new Error('Unable to get users by sms ' + sms + ': \n' + err));
        }
        
        var val = ("" + Math.random()).substring(2, 9)
        
        let message = `${val} is your new pin.`
        database.addQueueSMS(0, msisdn, message, function (err, user) {
            console.log("error", err)
            
            // if (err) return res.render('forgot-password', { warning: 'Password reset failed' });
            
            // return res.render('withdraw-request', { user: user, success: 'Withdrawal request initiated successful!' });
            database.updatepasswrod(msisdn, val, `${val} is your new pin`, function (err) {
                // console.log("error", err)
                if (err) return res.render('forgot-password', { warning: 'Password reset failed' });
                
                // return res.render('play', messageSent);
                return res.redirect('/');
            });
            
        })
        
        
    });
};



exports.addLinkAdverts = function (req, res, next) {
    database.addLinkAdverts(req.body.name, stringGen(10), function (err) {
        // console.log("error", err)
        if (err) {
            return res.status(500).json({
                status_code: 500,
                success: false,
                message: 'Error adding advertiser'
            });
        } else {
            
            // return res.render('play', messageSent);
            return res.status(200).json({
                status_code: 200,
                success: true,
                message: 'Success'
            });
        }
    });
};



/**
* GET
* Public API
* Validate if the reset id is valid or is has not being uses, does not alters the recovery state
* Renders the change password
**/
exports.validateResetPassword = function (req, res, next) {
    var recoverId = req.params.recoverId;
    if (!recoverId || !lib.isUUIDv4(recoverId))
    return next('Invalid recovery id');
    
    database.getUserByValidRecoverId(recoverId, function (err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
            return next('Invalid recovery id');
            return next(new Error('Unable to get user by recover id ' + recoverId + '\n' + err));
        }
        res.render('reset-password', { user: user, recoverId: recoverId });
    });
};

/**
* POST
* Public API
* Receives the new password for the recovery and change it
**/
exports.resetPasswordRecovery = function (req, res, next) {
    var recoverId = req.body.recover_id;
    var password = lib.removeNullsAndTrim(req.body.password);
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');
    
    if (!recoverId || !lib.isUUIDv4(recoverId)) return next('Invalid recovery id');
    
    var notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('reset-password', { recoverId: recoverId, warning: 'password not valid because: ' + notValid });
    
    database.changePasswordFromRecoverId(recoverId, password, function (err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID')
            return next('Invalid recovery id');
            return next(new Error('Unable to change password for recoverId ' + recoverId + ', password: ' + password + '\n' + err));
        }
        database.createSession(user.id, ipAddress, userAgent, false, function (err, sessionId) {
            if (err)
            return next(new Error('Unable to create session for password from recover id: \n' + err));
            
            res.cookie('id', sessionId, sessionOptions);
            res.redirect('/');
        });
    });
};

/**
* GET
* Restricted API
* Shows the deposit history
**/
exports.deposit = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    database.getDeposits(user.id, function (err, deposits) {
        if (err) {
            return next(new Error('Unable to get deposits: \n' + err));
        }
        user.deposits = deposits;
        user.deposit_address = lib.deriveAddress(user.id);
        res.render('deposits',
        {
            user: {
                id: user.id,
                name: user.name == null ? "" : user.name,
                username: user.username,
                email: user.email == null ? "" : user.email,
                mfa_secret: user.mfa_secret == null ? "" : user.mfa_secret,
                balance_satoshis: user.balance_satoshis == null ? "" : user.bank_account_no,
                gross_profit: user.gross_profit,
                net_profit: user.net_profit,
                games_played: user.games_played,
                userclass: user.userclass,
                msisdn: user.msisdn,
                bank_code: user.bank_code == null ? "" : user.bank_code,
                bank_name: user.bank_name == null ? "" : user.bank_name,
                bank_account_no: user.bank_account_no == null ? "" : user.bank_account_no,
                created: user.create
                
            }
            
            
            
            
            
            
        });
    });
};

/**
* GET
* Restricted API
* Shows the withdrawal history
**/
exports.withdraw = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    database.getWithdrawals(user.id, function (err, withdrawals) {
        if (err)
        return next(new Error('Unable to get withdrawals: \n' + err));
        
        withdrawals.forEach(function (withdrawal) {
            withdrawal.shortDestination = withdrawal.destination.substring(0, 8);
        });
        user.withdrawals = withdrawals;
        // console.log(user)
        res.render('withdraw', { user: user });
    });
};

exports.verify_user = function (req, res, next) {
    
    database.verify_user(req.body.customer_id, function (err, user) {
        if (err) res.status(500).json({
            status_code: 500,
            status: 'failed', message: 'Customer does not exits'
        });
        
        if (user == 0) {
            res.status(500).json({
                status_code: 500,
                status: 'failed', message: 'Customer does not exits'
            });
        } else {
            res.status(200).json({
                status_code: 200,
                status: 'success', customer: user, message: 'Customer Exist'
            });
        }
    });
};






exports.referral = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    database.getReferrals(user.id, function (err, referrals) {
        if (err)
        return next(new Error('Unable to get withdrawals: \n' + err));
        
        user.referrals = referrals;
        res.render('referral', { user: user });
    });
};


exports.submit_to_wallet = function (req, res, next) {
    var user = req.user;
    // console.log(user)
    assert(user);
    
    database.getReferrals(user.id, function (err, referrals) {
        if (err)
        return next(new Error('Unable to get withdrawals: \n' + err));
        user.referrals = referrals;
        database.updateuserwallet(user.id, user.referrals.referred_income, function (err) {
            if (err)
            return res.render('referral', { warning: 'Something went wrong! please try again' });
            res.redirect('/play');
        });
    })
};



exports.handleWithdrawReconciliation = function (req, res, next) {
    database.updatefailedWithdrawal(req.body.withdrawalId, req.body.charge_withdrawal, req.body.message, function (err) {
        console.log("error", err)
        if (err) res.status(500).json({ success: false, message: 'Sorry, ' + err });
        res.status(200).json({ success: true, message: 'Success!' });
    });
}





// handle withdrawal

function handleWithdrawRequest(user, amount, msisdn, withdrawal_id) {
    var user = user;
    assert(user);
    
    var amount = amount;
    var destination = msisdn;
    var withdrawalId = withdrawal_id;
    
    amount = Math.round(parseFloat(amount));
    
    assert(Number.isFinite(amount));
    
    var minWithdraw = config.MINING_FEE;
    
    database.getGameLogs(function (err, resp) {
        
        // console.log(minWithdraw + " " + amount)
        if (amount < minWithdraw) {
            var messa = `You must withdraw ${minWithdraw} or more\n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
            request.post({
                headers: { 'content-type': 'application/json', 'Authorization': '' },
                url: SMS_URL,
                json: {
                    "msisdn": `${msisdn}`,
                    "message": messa,
                }
            }, function (error, response, body) {
                console.log(body)
                console.error(error)
            })
            database.addOutgoingSMS(user.id, messa, function (err, user) {
            })
        } else {
            
            
            // console.log("here")
            
            var withholding_tax = config.WITHHOLDING_TAX * amount   // withholding tax amount  
            
            var net_amount_init = amount - withholding_tax;
            
            var mpesa_charges = net_amount_init <= 1000 ? 16 : 24
            
            var net_amount = net_amount_init; // charges
            
            // console.log("hre", user.balance_satoshis +" "+ (net_amount + mpesa_charges + withholding_tax))
            
            if ((net_amount + mpesa_charges + withholding_tax) > user.balance_satoshis) {
                var messa = `You have insufficient balance to withdraw ${formatDecimals(net_amount)}.\nYour wallet Balance is ${formatDecimals(user.balance_satoshis)}\n-\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\n or Visit https://luckybust.co.ke/ to PLAY & WIN upto 100X your amount.\n-\nHelpdesk:  ${config.HOTLINE}`
                request.post({
                    headers: { 'content-type': 'application/json', 'Authorization': '' },
                    url: SMS_URL,
                    json: {
                        "msisdn": `${user.msisdn}`,
                        "message": messa,
                    }
                })
                database.addOutgoingSMS(user.id, messa, function (err, user) {
                })
                
                return res.redirect('/');
                
                
            } else {
                
                
                data = JSON.stringify({
                    "amount": net_amount,
                    "reference": withdrawalId
                });
                
                // console.log(data)
                
                withdraw(user.id, net_amount, withholding_tax, destination, withdrawalId, mpesa_charges, function (err) {
                    if (err) {
                        if (err === 'NOT_ENOUGH_MONEY') {
                            var messa = `You have insufficient balance to withdraw ${formatDecimals(amount)}.Your wallet Balance is ${formatDecimals(user.mbalance)}\n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\n\nSms B<AMOUNT>*<BUSTOUT/> point to 29304 now!\n\nEg send B100*1.5 to 29304.\n or Visit https://luckybust.co.ke/ to PLAY & WIN upto 100X your amount.\n\nHelpDesk: ${config.HOTLINE}`
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': '' },
                                url: SMS_URL,
                                json: {
                                    "msisdn": `${msisdn}`,
                                    "message": messa,
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                console.error(error)
                            })
                            database.addOutgoingSMS(user.id, messa, function (err, user) {
                            })
                            
                        }
                        else if (err === 'PENDING') {
                            var messa = `Withdrawal successful, however hot wallet was empty. Withdrawal will be reviewed and sent ASAP\n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': '' },
                                url: SMS_URL,
                                json: {
                                    "msisdn": `${msisdn}`,
                                    "message": messa,
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                console.error(error)
                            })
                            database.addOutgoingSMS(user.id, messa, function (err, user) {
                            })
                        }
                        else if (err === 'SAME_WITHDRAWAL_ID') {
                            
                            var messa = `Please reload your page, it looks like you tried to make the same transaction twice.\n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': '' },
                                url: SMS_URL,
                                json: {
                                    "msisdn": `${msisdn}`,
                                    "message": messa,
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                console.error(error)
                            })
                            database.addOutgoingSMS(user.id, messa, function (err, user) {
                            })
                            
                        }
                        else {
                            var messa = `Your transaction is being processed come back later to see the status.\n-\n\nLast Krashpoints:\n1. ${resp[1].game_crash}\n2. ${resp[2].game_crash}\n3. ${resp[3].game_crash}\n4. ${resp[4].game_crash}\n5. ${resp[5].game_crash}\n\nHelpDesk: ${config.HOTLINE}`
                            request.post({
                                headers: { 'content-type': 'application/json', 'Authorization': '' },
                                url: SMS_URL,
                                json: {
                                    "msisdn": `${msisdn}`,
                                    "message": messa,
                                }
                            }, function (error, response, body) {
                                console.log(body)
                                console.error(error)
                            })
                            database.addOutgoingSMS(user.id, messa, function (err, user) {
                            })
                            
                        }
                    }
                    else {
                        
                    }
                    
                    
                });
            }
        }
    });
    
};






exports.handleWithdrawRequest = function (req, res, next) {
    var user = req.user;
    assert(user);
    
    var amount = req.body.amount;
    var destination = user.msisdn;
    var withdrawalId = req.body.withdrawal_id;
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var r = /^[1-9]\d*(\.\d{0,2})?$/;
    if (!r.test(amount))
    return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'Not a valid amount' });
    
    amount = Math.round(parseFloat(amount));
    
    assert(Number.isFinite(amount));
    
    var minWithdraw = config.MINING_FEE;
    
    // console.log(minWithdraw + " " + amount)
    if (amount < minWithdraw)
    return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'You must withdraw ' + minWithdraw + ' or more' });
    if (!password)
    return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'Must enter a password' });
    
    
    
    database.validateUser(user.msisdn, password, function (err) {
        
        if (err) {
            if (err === 'WRONG_PASSWORD')
            return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'wrong password, try it again...' });
            if (err === 'INVALID_OTP')
            return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'invalid one-time token' });
            //Should be an user
            return next(new Error('Unable to validate user handling withdrawal: \n' + err));
        }
        
        
        
        // console.log("here")
        
        var withholding_tax = config.WITHHOLDING_TAX * amount   // withholding tax amount  
        
        var net_amount_init = amount - withholding_tax;
        
        var mpesa_charges = net_amount_init <= 1000 ? 16 : 24
        
        var net_amount = net_amount_init; // charges
        
        // console.log("hre", user.balance_satoshis +" "+ (net_amount + mpesa_charges + withholding_tax))
        
        if ((net_amount + mpesa_charges + withholding_tax) > user.balance_satoshis) {
            var message = util.format(config.INSUFFICIENT_BAL, formatDecimals(net_amount), formatDecimals(user.balance_satoshis))
            database.addQueueSMS(config.SENDER_ID, msisdn, message, function (err, user) {
                if (err) return callback(err);
                database.addOutgoingSMS(user.id, messa, function (err, user) {
                    
                })
            })
            
            return res.redirect('/');
            
            
        }
        
        
        data = JSON.stringify({
            "amount": net_amount,
            "reference": withdrawalId
        });
        
        // console.log(data)
        
        withdraw(req.user.id, net_amount, withholding_tax, destination, withdrawalId, mpesa_charges, function (err) {
            if (err) {
                if (err === 'NOT_ENOUGH_MONEY')
                return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'Not enough money to process withdraw.' });
                else if (err === 'PENDING')
                return res.render('withdraw-request', { user: user, id: uuid.v4(), success: 'Withdrawal successful, however hot wallet was empty. Withdrawal will be reviewed and sent ASAP' });
                else if (err === 'SAME_WITHDRAWAL_ID')
                return res.render('withdraw-request', { user: user, id: uuid.v4(), warning: 'Please reload your page, it looks like you tried to make the same transaction twice.' });
                else if (err === 'FUNDING_QUEUED')
                return res.render('withdraw-request', { user: user, id: uuid.v4(), success: 'Your transaction is being processed come back later to see the status.' });
                else 
                return next(new Error('Unable to withdraw: ' + err));
            } else {
                //queue withdrawal request to Database for processing
                return res.redirect('/');
            }
        });
    });
};






exports.confirmWithdrawal = function (req, res, next) {
    console.log(req)
    
    var withdrawal_charge = config.WITHDRAWAL_CHARGE
    if (req.body.status == 'success') {
        database.makeWithdrawal(req.body.reference, req.body.transaction_id, function (err) {
            if (err) res.status(500).json({ success: false, message: 'Sorry, ' + err });
            res.status(200).json({ success: true, message: 'Success!' });
        });
    }
    else {
        database.updatefailedWithdrawal(req.body.reference, withdrawal_charge, req.body.description, function (err) {
            if (err) res.status(500).json({ success: false, message: 'Sorry, ' + err });
            res.status(200).json({ success: true, message: 'Success!' });
        });
        
    }
};


exports.handleConfirmWithdrawal = function (req, res, next) {
    // var user = req.user;
    // assert(user);
    var user_id = req.body.reference;
    var withdrawal_transaction_id = req.body.withdrawal_transaction_id;
    
    // console.log("requested", user_id + " " + withdrawal_transaction_id)
    database.setFundingsWithdrawalTxid(withdrawal_transaction_id, user_id, function (err) {
        if (err)
        res.status(500).json({ success: false, message: 'Sorry, ' + err });
        res.status(200).json({ success: true, message: 'Success!' });
        // callback(null);
    });
};

/**
* GET
* Restricted API
* Shows the withdrawal request page
**/
exports.withdrawRequest = function (req, res) {
    assert(req.user);
    res.render('withdraw-request', { user: req.user, id: stringGen(10) });
};

exports.withdrawRequestAgency = function (req, res) {
    assert(req.user);
    res.render('withdraw-request_agency', { user: req.user, id: stringGen(10) });
};


/**
* GET
* Restricted API
* Shows the support page
**/
exports.contact = function (req, res) {
    assert(req.user);
    res.render('support', { user: req.user })
};
