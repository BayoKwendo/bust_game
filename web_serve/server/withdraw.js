var assert = require('assert');
var bc = require('./bitcoin_client');
var db = require('./database');
var request = require('request');
var config = require('../config/config');

// Doesn't validate
module.exports = function (userId, amount, withdrawl_charges,  withdrawalAddress, withdrawalId, mpesa_charges, callback) {  // calculate withdrawals
    assert(typeof userId === 'number');
    assert(typeof callback === 'function');


    db.requestWithdrawal(userId, amount, withdrawl_charges, withdrawalAddress, withdrawalId, mpesa_charges, function (err) {

        if (err) {
            if (err.code === '23514')
                callback('NOT_ENOUGH_MONEY');
            else if (err.code === '23505')
                callback('SAME_WITHDRAWAL_ID');
            else
                callback(err);
            return;
            
        }


        console.log("error here", withdrawalId)
        callback(null);

    });
};