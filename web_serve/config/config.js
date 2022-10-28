/**
 * For development you can set the variables by creating a .env file on the root
 */
var fs = require("fs");
var production = process.env.NODE_ENV === "production";

var prodConfig;
if (production) {
  prodConfig = JSON.parse(fs.readFileSync(__dirname + "/build-config.json"));
  console.log("Build config loaded: ", prodConfig);
}
module.exports = {
  PRODUCTION: production,
  DATABASE_URL: "postgres://supabasta:xAs9cMVZSRPWGCNufEGg@localhost/supabastadb",
  BIP32_DERIVED:
    "xpub6AHA9hZDN11k2ijHMeS5QqHx2KP9aMBRhTDqANMnwVtdyw2TDYRmF8PjpvwUFcL1Et8Hj59S3gTSMcUQ5gAqTz3Wd8EsMTmF3DChhqPQBnU",
  AWS_SES_KEY: process.env.AWS_SES_KEY,
  AWS_SES_SECRET: process.env.AWS_SES_SECRET,
  CONTACT_EMAIL: process.env.CONTACT_EMAIL || "maureen@mobisphere.com",
  SITE_URL: process.env.SITE_URL || "https://play.SupaBasta.com/",
  GAME_BASEURL: "http://localhost:3846",
  HOTLINE: "0703012900",

  SMS_URL: "http://0.0.0.0:1410/autoresponse",
  ENC_KEY: process.env.ENC_KEY || "devkey",
  SIGNING_SECRET: process.env.SIGNING_SECRET || "secret",
  BANKROLL_OFFSET: parseInt(process.env.BANKROLL_OFFSET) || 0,
  RECAPTCHA_PRIV_KEY:
    process.env.RECAPTCHA_PRIV_KEY ||
    "6LeXIAoTAAAAAFGjKCoONRo8L3gD5IVG39F7d_St",
  RECAPTCHA_SITE_KEY:
    process.env.RECAPTCHA_SITE_KEY ||
    "6LeXIAoTAAAAAA2lTK931SbFIq2Cn88HFE4XxZPR",
  BITCOIND_HOST: process.env.BITCOIND_HOST,
  BITCOIND_PORT: process.env.BITCOIND_PORT || 8332,
  BITCOIND_USER: process.env.BITCOIND_USER,
  BITCOIND_PASS: process.env.BITCOIND_PASS,
  BITCOIND_CERT: process.env.BITCOIND_CERT || "",
  PORT: process.env.PORT || 3852,
  MINING_FEE: process.env.MINING_FEE || 50, //minimum withdrawal
  BUILD: prodConfig,
  EXCISE_DUTY: 0.075,
  MINIMUM_STACK: "10",
  MAXIMUM_STAKE: "3000",
  CASHOUT: "1.5",
  MINIMUM_CASHOUT: "1.01",

  WITHHOLDING_TAX: 0.02,
  WITHDRAWAL_CHARGE: 12,
  VIG: 0.1,
  COMMISSION: 100, // commission value
  RETENTION_FEE: 0.02, // 2 percent
  RETENTION_EXPIRY: 30, // expiry
  BONUS: 50,
  SENDER_ID: "Mobi Sphere",
  //Messages
  SMS_DEPOSIT: `Your deposit of %s has been processed successfully.\nYour wallet balance is %s.\n-\nPlay in the next round and win upto 100 X your bet amount on SuperBust. Go to https://play.supabusta.co.ke/ and be the next winner!\\nHelpDesk: 0110095465.`,
  SMS_WITHDRAW: `Your withdrawal request of %s has been processed successful.\nYour wallet balance is %s.Kindly note that M-pesa charges apply.\n-\nWIN every second on SuperBust! Go to https://play.supabusta.co.ke/ and be the next winner!\n\nHelpDesk: 0110095465.`,
  INSUFFICIENT_BAL: `You have insufficient balance to withdraw %s.\nYour wallet Balance is %s\n-\n\n.Visit https://supabusta.co.ke/ to PLAY & WIN upto 100X your amount.\n-\nHelpdesk: 0110095465.`
};
