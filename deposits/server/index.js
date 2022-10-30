var fs = require('fs');

var express = require('express');
var async = require('async');


var http = require('http');
var compression = require('compression');
var path = require('path');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cron = require('node-cron');

var _ = require('lodash');
var debug = require('debug')('app:index');
var app = express();

var cors = require('cors')

app.disable('view cache'); //app: is express

app.set('etag', false)


app.use(cors())

var config = require('../config/config');
var database = require('./database');
debug('booting bustabit webserver');

/** Render Engine
*
* Put here render engine global variable trough app.locals
* **/
app.set("views", path.join(__dirname, '../views'));

app.locals.recaptchaKey = config.RECAPTCHA_SITE_KEY;
app.locals.buildConfig = config.BUILD;
app.locals.miningFeeBits = config.MINING_FEE;

var dotCaching = true;
if (!config.PRODUCTION) {
    app.locals.pretty = true;
    dotCaching = false;
}

// setTimeout(()=> {
//     task.stop();
// },1000)



/** Middleware **/
app.use(bodyParser());
app.use(cookieParser());
app.use(compression());


/** App settings **/
app.set("view engine", "html");
app.disable('x-powered-by');
app.enable('trust proxy');


/** Serve Static content **/
var twoWeeksInSeconds = 1209600;

const loop = async () => {
    await database.addDeposit( async (err, user) => {
        if (err) {console.log(err)}
        await loop()
    });
}
// while (d) {
//     console.log(d)
//     d = false

// }

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
})

if (config.PRODUCTION) {
    app.use(express.static(path.join(__dirname, '../build'), { maxAge: twoWeeksInSeconds * 1000 }));
} else {
    app.use(express.static(path.join(__dirname, '../client_new'), { maxAge: twoWeeksInSeconds * 1000 }));
    // app.use('/client_old', express.static(path.join(__dirname, '../client_old'), { maxAge: twoWeeksInSeconds * 1000 }));
    app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')), { maxAge: twoWeeksInSeconds * 1000 });
}

/**  Server **/
// socketIO.listen(3842);

var server = http.createServer(app);




server.listen(2001, async function () {
    console.log('Listening on port ', 2001);

    await loop()

});

/** Log uncaught exceptions and kill the application **/
process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
});